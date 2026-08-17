import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type { ActivateJourneyCommand } from "../../../packages/contracts/journey";
import type {
  JourneyDecisionClock,
  JourneyDecisionIdGenerator,
  JourneyDecisionUnitOfWork,
} from "../../../packages/domain/journey-decision";
import type { JourneyDecisionReader } from "../../../packages/domain/journey-read";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import {
  activateJourneyDecision,
  JourneyDecisionError,
} from "./activate-journey-decision";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import {
  getJourneyOverview,
  JourneyOverviewReadError,
} from "./get-journey-overview";
import { appendVaryHeader } from "./private-cors";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";
import {
  WebWriteIdempotencyError,
  withWebWriteIdempotency,
} from "./web-write-idempotency";

const MAX_BODY_BYTES = 8 * 1024;

export interface PrivateJourneyApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  journeyReader?: JourneyDecisionReader;
  journeyUnitOfWork?: JourneyDecisionUnitOfWork;
  journeyClock?: JourneyDecisionClock;
  journeyIds?: JourneyDecisionIdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class JourneyRequestError extends Error {}

type JourneyRoute = "OVERVIEW" | "ACTIVATE";

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

function routeOf(request: IncomingMessage): JourneyRoute | undefined {
  const path = pathOf(request);
  if (path === "/api/v1/journey") return "OVERVIEW";
  if (path === "/api/v1/journey/current") return "ACTIVATE";
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
  if (encoding !== undefined && encoding !== "identity") throw new JourneyRequestError();
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new JourneyRequestError();
  }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new JourneyRequestError();
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new JourneyRequestError();
  }
}

function commandFromBody(body: Record<string, unknown>): ActivateJourneyCommand {
  const expectedKeys = ["activeCapability", "approval", "expectedCurrentJourneyId", "name"].sort();
  const actualKeys = Object.keys(body).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new JourneyRequestError();
  }

  const approval = body.approval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) throw new JourneyRequestError();
  const approvalRecord = approval as Record<string, unknown>;
  const expectedApprovalKeys = ["acknowledgement", "explicit"].sort();
  const actualApprovalKeys = Object.keys(approvalRecord).sort();
  if (
    actualApprovalKeys.length !== expectedApprovalKeys.length
    || actualApprovalKeys.some((key, index) => key !== expectedApprovalKeys[index])
  ) {
    throw new JourneyRequestError();
  }

  if (typeof body.name !== "string" || typeof body.activeCapability !== "string") throw new JourneyRequestError();
  if (body.expectedCurrentJourneyId !== null && typeof body.expectedCurrentJourneyId !== "string") {
    throw new JourneyRequestError();
  }
  if (typeof approvalRecord.explicit !== "boolean" || typeof approvalRecord.acknowledgement !== "string") {
    throw new JourneyRequestError();
  }

  return {
    name: body.name,
    activeCapability: body.activeCapability,
    expectedCurrentJourneyId: body.expectedCurrentJourneyId,
    approval: {
      explicit: approvalRecord.explicit,
      acknowledgement: approvalRecord.acknowledgement as "ACTIVATE_JOURNEY",
    },
  };
}

function mapJourneyError(error: JourneyDecisionError, response: ServerResponse) {
  if (error.code === "APPROVAL_REQUIRED") {
    json(response, 409, { status: "explicit_approval_required" });
    return;
  }
  if (error.code === "CURRENT_JOURNEY_CHANGED") {
    json(response, 409, { status: "current_journey_changed" });
    return;
  }
  if (error.code === "JOURNEY_UNCHANGED") {
    json(response, 409, { status: "journey_unchanged" });
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
  json(response, 400, { status: "invalid_journey" });
}

export async function handlePrivateJourneyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateJourneyApiDependencies,
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
      const reader = dependencies.journeyReader;
      if (!reader) {
        json(response, 503, { status: "journey_unavailable" });
        return;
      }

      const overview = await runInstrumentedOperation({
        operation: "GET_JOURNEY_OVERVIEW",
        runtime: dependencies.runtime,
        telemetry: dependencies.telemetry,
        timer: dependencies.operationTimer,
        initialTrace: { requestId: transportContext.requestId },
        async work() {
          const value = await getJourneyOverview(
            { principal: transportContext.principal },
            { reader },
          );
          return { value };
        },
        classifyFailure(error) {
          if (error instanceof JourneyOverviewReadError) {
            return { outcome: "FAILED", errorCode: "JOURNEY_OVERVIEW_INVALID" };
          }
          return { outcome: "FAILED", errorCode: "JOURNEY_OVERVIEW_READ_FAILED" };
        },
      });

      json(response, 200, overview);
      return;
    }

    const unitOfWork = dependencies.journeyUnitOfWork;
    const journeyClock = dependencies.journeyClock;
    const journeyIds = dependencies.journeyIds;
    if (!unitOfWork || !journeyClock || !journeyIds) {
      json(response, 503, { status: "journey_mutation_unavailable" });
      return;
    }

    requireJsonContentType(request);
    const command = commandFromBody(await readBody(request));
    const context = withWebWriteIdempotency(
      transportContext,
      "JOURNEY_ACTIVATE",
      idempotencyKey(request),
    );

    const receipt = await runInstrumentedOperation({
      operation: "ACTIVATE_JOURNEY",
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId },
      async work() {
        const value = await activateJourneyDecision(command, context, {
          unitOfWork,
          clock: journeyClock,
          ids: journeyIds,
        });
        return { value };
      },
      classifyFailure(error) {
        if (error instanceof JourneyDecisionError) {
          if (error.code === "CURRENT_JOURNEY_CHANGED" || error.code === "JOURNEY_UNCHANGED" || error.code === "IDEMPOTENCY_CONFLICT") {
            return { outcome: "REJECTED", errorCode: error.code };
          }
          return { outcome: "REJECTED", errorCode: "JOURNEY_DECISION_INVALID" };
        }
        return { outcome: "FAILED", errorCode: "JOURNEY_DECISION_FAILED" };
      },
    });

    json(response, 200, {
      status: receipt.idempotentReplay ? "replayed" : "active",
      journeyId: receipt.journeyId,
      authorityClass: receipt.authorityClass,
      decidedAt: receipt.decidedAt,
      ...(receipt.supersededJourneyId ? { supersededJourneyId: receipt.supersededJourneyId } : {}),
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
    if (error instanceof JourneyRequestError) {
      json(response, 400, { status: "invalid_request" });
      return;
    }
    if (error instanceof WebWriteIdempotencyError) {
      json(response, 400, { status: "idempotency_required" });
      return;
    }
    if (error instanceof JourneyDecisionError) {
      mapJourneyError(error, response);
      return;
    }
    if (error instanceof JourneyOverviewReadError) {
      json(response, 500, { status: "internal_error" });
      return;
    }
    json(response, 500, { status: "internal_error" });
  }
}

export function createLifeOsPrivateJourneyServer(dependencies: PrivateJourneyApiDependencies): Server {
  return createServer((request, response) => {
    void handlePrivateJourneyRequest(request, response, dependencies);
  });
}
