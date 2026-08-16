import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type { SetCurrentDirectionCommand } from "../../../packages/contracts/direction";
import type {
  DirectionDecisionClock,
  DirectionDecisionIdGenerator,
  DirectionDecisionUnitOfWork,
} from "../../../packages/domain/direction-decision";
import type { DirectionDecisionReader } from "../../../packages/domain/direction-read";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import {
  activateDirectionDecision,
  DirectionDecisionError,
} from "./activate-direction-decision";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import {
  DirectionOverviewReadError,
  getDirectionOverview,
} from "./get-direction-overview";
import { appendVaryHeader } from "./private-cors";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";
import {
  WebWriteIdempotencyError,
  withWebWriteIdempotency,
} from "./web-write-idempotency";

const MAX_BODY_BYTES = 8 * 1024;

export interface PrivateDirectionApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  directionReader?: DirectionDecisionReader;
  directionUnitOfWork?: DirectionDecisionUnitOfWork;
  directionClock?: DirectionDecisionClock;
  directionIds?: DirectionDecisionIdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class DirectionRequestError extends Error {}

type DirectionRoute = "OVERVIEW" | "SET_CURRENT";

function json(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("pragma", "no-cache");
  appendVaryHeader(response, "Authorization");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.end(JSON.stringify(payload));
}

function pathOf(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://life-os.invalid").pathname;
  } catch {
    return "/invalid-request-target";
  }
}

function routeOf(request: IncomingMessage): DirectionRoute | undefined {
  const path = pathOf(request);
  if (path === "/api/v1/direction") return "OVERVIEW";
  if (path === "/api/v1/direction/current") return "SET_CURRENT";
  return undefined;
}

function bearerCredential(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.length > 4096) return undefined;
  return /^Bearer ([^\s,]+)$/.exec(header)?.[1];
}

function idempotencyKey(request: IncomingMessage): string | undefined {
  const header = request.headers["idempotency-key"];
  return typeof header === "string" ? header : undefined;
}

function requireJsonContentType(request: IncomingMessage) {
  const encoding = request.headers["content-encoding"];
  if (encoding !== undefined && encoding !== "identity") throw new DirectionRequestError();
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new DirectionRequestError();
  }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new DirectionRequestError();
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new DirectionRequestError();
  }
}

function commandFromBody(body: Record<string, unknown>): SetCurrentDirectionCommand {
  const expectedKeys = ["approval", "expectedCurrentDirectionId", "statement"].sort();
  const actualKeys = Object.keys(body).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new DirectionRequestError();
  }

  const approval = body.approval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) throw new DirectionRequestError();
  const approvalRecord = approval as Record<string, unknown>;
  const expectedApprovalKeys = ["acknowledgement", "explicit"].sort();
  const actualApprovalKeys = Object.keys(approvalRecord).sort();
  if (
    actualApprovalKeys.length !== expectedApprovalKeys.length
    || actualApprovalKeys.some((key, index) => key !== expectedApprovalKeys[index])
  ) {
    throw new DirectionRequestError();
  }

  if (typeof body.statement !== "string") throw new DirectionRequestError();
  if (body.expectedCurrentDirectionId !== null && typeof body.expectedCurrentDirectionId !== "string") {
    throw new DirectionRequestError();
  }
  if (typeof approvalRecord.explicit !== "boolean" || typeof approvalRecord.acknowledgement !== "string") {
    throw new DirectionRequestError();
  }

  return {
    statement: body.statement,
    expectedCurrentDirectionId: body.expectedCurrentDirectionId,
    approval: {
      explicit: approvalRecord.explicit,
      acknowledgement: approvalRecord.acknowledgement as "SET_AS_CURRENT_DIRECTION",
    },
  };
}

function mapDirectionError(error: DirectionDecisionError, response: ServerResponse) {
  if (error.code === "APPROVAL_REQUIRED") {
    json(response, 409, { status: "explicit_approval_required" });
    return;
  }
  if (error.code === "CURRENT_DIRECTION_CHANGED") {
    json(response, 409, { status: "current_direction_changed" });
    return;
  }
  if (error.code === "DIRECTION_UNCHANGED") {
    json(response, 409, { status: "direction_unchanged" });
    return;
  }
  if (error.code === "IDEMPOTENCY_CONFLICT") {
    json(response, 409, { status: "idempotency_conflict" });
    return;
  }
  if (error.code === "IDEMPOTENCY_REQUIRED") {
    json(response, 400, { status: "idempotency_required" });
    return;
  }
  json(response, 400, { status: "invalid_direction" });
}

export async function handlePrivateDirectionRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateDirectionApiDependencies,
): Promise<void> {
  const route = routeOf(request);
  if (!route) {
    json(response, 404, { status: "not_found" });
    return;
  }

  const allowedMethod = route === "OVERVIEW" ? "GET" : "POST";
  if (request.method !== allowedMethod) {
    response.setHeader("allow", allowedMethod);
    json(response, 405, { status: "method_not_allowed" });
    return;
  }

  try {
    const transportContext = await createTrustedWebRequestContext(
      { credential: bearerCredential(request) },
      {
        sessionVerifier: dependencies.sessionVerifier,
        clock: dependencies.transportClock,
        requestIds: dependencies.requestIds,
      },
    );

    if (route === "OVERVIEW") {
      const reader = dependencies.directionReader;
      if (!reader) {
        json(response, 503, { status: "direction_unavailable" });
        return;
      }

      const overview = await runInstrumentedOperation({
        operation: "GET_DIRECTION_OVERVIEW",
        runtime: dependencies.runtime,
        telemetry: dependencies.telemetry,
        timer: dependencies.operationTimer,
        initialTrace: { requestId: transportContext.requestId },
        async work() {
          const value = await getDirectionOverview(
            { principal: transportContext.principal },
            { reader },
          );
          return { value };
        },
        classifyFailure(error) {
          if (error instanceof DirectionOverviewReadError) {
            return { outcome: "FAILED", errorCode: "DIRECTION_OVERVIEW_INVALID" };
          }
          return { outcome: "FAILED", errorCode: "DIRECTION_OVERVIEW_READ_FAILED" };
        },
      });

      json(response, 200, overview);
      return;
    }

    const unitOfWork = dependencies.directionUnitOfWork;
    const directionClock = dependencies.directionClock;
    const directionIds = dependencies.directionIds;
    if (!unitOfWork || !directionClock || !directionIds) {
      json(response, 503, { status: "direction_mutation_unavailable" });
      return;
    }

    requireJsonContentType(request);
    const command = commandFromBody(await readBody(request));
    const context = withWebWriteIdempotency(
      transportContext,
      "DIRECTION_SET_CURRENT",
      idempotencyKey(request),
    );

    const receipt = await runInstrumentedOperation({
      operation: "SET_CURRENT_DIRECTION",
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId },
      async work() {
        const value = await activateDirectionDecision(command, context, {
          unitOfWork,
          clock: directionClock,
          ids: directionIds,
        });
        return { value };
      },
      classifyFailure(error) {
        if (error instanceof DirectionDecisionError) {
          if (error.code === "CURRENT_DIRECTION_CHANGED" || error.code === "DIRECTION_UNCHANGED" || error.code === "IDEMPOTENCY_CONFLICT") {
            return { outcome: "REJECTED", errorCode: error.code };
          }
          return { outcome: "REJECTED", errorCode: "DIRECTION_DECISION_INVALID" };
        }
        return { outcome: "FAILED", errorCode: "DIRECTION_DECISION_FAILED" };
      },
    });

    json(response, 200, {
      status: receipt.idempotentReplay ? "replayed" : "active",
      directionId: receipt.directionId,
      authorityClass: receipt.authorityClass,
      decidedAt: receipt.decidedAt,
      ...(receipt.supersededDirectionId ? { supersededDirectionId: receipt.supersededDirectionId } : {}),
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      json(response, 401, { status: "authentication_required" });
      return;
    }
    if (error instanceof AuthenticationUnavailableError) {
      json(response, 503, { status: "authentication_unavailable" });
      return;
    }
    if (error instanceof DirectionRequestError) {
      json(response, 400, { status: "invalid_request" });
      return;
    }
    if (error instanceof WebWriteIdempotencyError) {
      json(response, 400, { status: "idempotency_required" });
      return;
    }
    if (error instanceof DirectionDecisionError) {
      mapDirectionError(error, response);
      return;
    }
    if (error instanceof DirectionOverviewReadError) {
      json(response, 500, { status: "internal_error" });
      return;
    }
    json(response, 500, { status: "internal_error" });
  }
}

export function createLifeOsPrivateDirectionServer(dependencies: PrivateDirectionApiDependencies): Server {
  return createServer((request, response) => {
    void handlePrivateDirectionRequest(request, response, dependencies);
  });
}
