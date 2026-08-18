import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ConfirmDriftUnderstandingCommand,
  DriftExplanation,
  DriftReturnPosture,
  RecordDriftCommand,
  RecordDriftReturnCommand,
} from "../../../packages/contracts/drift-return";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type {
  DriftClock,
  DriftIdGenerator,
  DriftUnitOfWork,
} from "../../../packages/domain/drift-return";
import type { DriftReader } from "../../../packages/domain/drift-return-read";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import { confirmDriftUnderstanding } from "./confirm-drift-understanding";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import { DriftError } from "./drift-return-validation";
import { getDriftOverview } from "./get-drift-overview";
import { appendVaryHeader } from "./private-cors";
import { recordDrift } from "./record-drift";
import { recordDriftReturn } from "./record-drift-return";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";
import {
  WebWriteIdempotencyError,
  withWebWriteIdempotency,
  type WebWriteIdempotencyScope,
} from "./web-write-idempotency";

const MAX_BODY_BYTES = 24 * 1024;

export interface PrivateDriftApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  driftReader?: DriftReader;
  driftUnitOfWork?: DriftUnitOfWork;
  driftClock?: DriftClock;
  driftIds?: DriftIdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class DriftRequestError extends Error {}

type Route =
  | { kind: "OVERVIEW" }
  | { kind: "RECORD" }
  | { kind: "UNDERSTANDING"; driftId: string }
  | { kind: "RETURN"; driftId: string };

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

function decodedPathId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new DriftRequestError();
  }
}

function routeOf(request: IncomingMessage): Route | undefined {
  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://life-os.invalid");
  } catch {
    throw new DriftRequestError();
  }
  if ([...url.searchParams.keys()].length > 0) throw new DriftRequestError();
  if (url.pathname === "/api/v1/drifts") {
    return request.method === "GET" ? { kind: "OVERVIEW" } : { kind: "RECORD" };
  }
  const understanding = /^\/api\/v1\/drifts\/([^/]+)\/understanding$/.exec(url.pathname);
  if (understanding) return { kind: "UNDERSTANDING", driftId: decodedPathId(understanding[1]!) };
  const driftReturn = /^\/api\/v1\/drifts\/([^/]+)\/return$/.exec(url.pathname);
  if (driftReturn) return { kind: "RETURN", driftId: decodedPathId(driftReturn[1]!) };
  return undefined;
}

function expectedMethod(route: Route): "GET" | "POST" {
  return route.kind === "OVERVIEW" ? "GET" : "POST";
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
  if (encoding !== undefined && encoding !== "identity") throw new DriftRequestError();
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string"
    || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
  ) throw new DriftRequestError();
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new DriftRequestError();
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new DriftRequestError();
  }
}

function exactKeys(body: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(body).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new DriftRequestError();
  }
}

function recordCommand(body: Record<string, unknown>): RecordDriftCommand {
  exactKeys(body, body.sourceNote === undefined ? [] : ["sourceNote"]);
  if (body.sourceNote !== undefined && typeof body.sourceNote !== "string") throw new DriftRequestError();
  return typeof body.sourceNote === "string" ? { sourceNote: body.sourceNote } : {};
}

function understandingCommand(body: Record<string, unknown>): ConfirmDriftUnderstandingCommand {
  const optional = ["triggerNote", "emotionNote", "distractionNote"].filter((key) => body[key] !== undefined);
  exactKeys(body, ["explanation", "expectedCurrentDecisionId", ...optional]);
  if (
    typeof body.explanation !== "string"
    || (body.expectedCurrentDecisionId !== null && typeof body.expectedCurrentDecisionId !== "string")
    || optional.some((key) => typeof body[key] !== "string")
  ) throw new DriftRequestError();
  return {
    explanation: body.explanation as DriftExplanation,
    expectedCurrentDecisionId: body.expectedCurrentDecisionId as string | null,
    ...(typeof body.triggerNote === "string" ? { triggerNote: body.triggerNote } : {}),
    ...(typeof body.emotionNote === "string" ? { emotionNote: body.emotionNote } : {}),
    ...(typeof body.distractionNote === "string" ? { distractionNote: body.distractionNote } : {}),
  };
}

function returnCommand(body: Record<string, unknown>): RecordDriftReturnCommand {
  exactKeys(body, ["returnPosture", "expectedCurrentRevision"]);
  if (typeof body.returnPosture !== "string" || typeof body.expectedCurrentRevision !== "number") {
    throw new DriftRequestError();
  }
  return {
    returnPosture: body.returnPosture as DriftReturnPosture,
    expectedCurrentRevision: body.expectedCurrentRevision,
  };
}

function writeScope(route: Exclude<Route, { kind: "OVERVIEW" }>): WebWriteIdempotencyScope {
  if (route.kind === "RECORD") return "DRIFT_RECORD";
  if (route.kind === "UNDERSTANDING") return "DRIFT_UNDERSTAND";
  return "DRIFT_RETURN";
}

function mapDomainError(error: DriftError, response: ServerResponse) {
  if (error.code === "DRIFT_NOT_FOUND") {
    json(response, 404, { status: "not_found" });
    return;
  }
  const conflicts = new Map([
    ["IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["DRIFT_DECISION_CHANGED", "drift_decision_changed"],
    ["DRIFT_DECISION_UNCHANGED", "drift_decision_unchanged"],
    ["DRIFT_UNDERSTANDING_REQUIRED", "drift_understanding_required"],
    ["DRIFT_ALREADY_RESOLVED", "drift_already_resolved"],
  ]);
  const status = conflicts.get(error.code);
  if (status) {
    json(response, 409, { status });
    return;
  }
  if (error.code === "IDEMPOTENCY_REQUIRED") {
    json(response, 400, { status: "idempotency_required" });
    return;
  }
  json(response, 400, { status: "invalid_drift" });
}

export async function handlePrivateDriftRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateDriftApiDependencies,
): Promise<void> {
  try {
    const route = routeOf(request);
    if (!route) {
      json(response, 404, { status: "not_found" });
      return;
    }
    const method = expectedMethod(route);
    if (request.method !== method) {
      response.setHeader("allow", method);
      json(response, 405, { status: "method_not_allowed" });
      return;
    }

    const transportContext = await createTrustedWebRequestContext(
      { credential: bearerCredential(request) },
      {
        sessionVerifier: dependencies.sessionVerifier,
        clock: dependencies.transportClock,
        requestIds: dependencies.requestIds,
      },
    );

    if (route.kind === "OVERVIEW") {
      if (!dependencies.driftReader) {
        json(response, 503, { status: "drift_unavailable" });
        return;
      }
      const value = await runInstrumentedOperation({
        operation: "GET_DRIFT_OVERVIEW",
        runtime: dependencies.runtime,
        telemetry: dependencies.telemetry,
        timer: dependencies.operationTimer,
        initialTrace: { requestId: transportContext.requestId },
        async work() {
          return { value: await getDriftOverview(
            transportContext.principal.userId,
            dependencies.driftReader!,
          ) };
        },
        classifyFailure(error) {
          return error instanceof DriftError
            ? { outcome: "REJECTED", errorCode: error.code }
            : { outcome: "FAILED", errorCode: "DRIFT_READ_FAILED" };
        },
      });
      json(response, 200, value);
      return;
    }

    const unitOfWork = dependencies.driftUnitOfWork;
    const clock = dependencies.driftClock;
    const ids = dependencies.driftIds;
    if (!unitOfWork || !clock || !ids) {
      json(response, 503, { status: "drift_mutation_unavailable" });
      return;
    }
    requireJsonContentType(request);
    const body = await readBody(request);
    const context = withWebWriteIdempotency(transportContext, writeScope(route), idempotencyKey(request));
    const operation = route.kind === "RECORD"
      ? "RECORD_DRIFT"
      : route.kind === "UNDERSTANDING"
        ? "CONFIRM_DRIFT_UNDERSTANDING"
        : "RECORD_DRIFT_RETURN";
    const receipt = await runInstrumentedOperation({
      operation,
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId },
      async work() {
        const value = route.kind === "RECORD"
          ? await recordDrift(recordCommand(body), context, { unitOfWork, clock, ids })
          : route.kind === "UNDERSTANDING"
            ? await confirmDriftUnderstanding(route.driftId, understandingCommand(body), context, {
              unitOfWork, clock, ids,
            })
            : await recordDriftReturn(route.driftId, returnCommand(body), context, {
              unitOfWork, clock, ids,
            });
        return { value };
      },
      classifyFailure(error) {
        return error instanceof DriftError
          ? { outcome: "REJECTED", errorCode: error.code }
          : { outcome: "FAILED", errorCode: "DRIFT_WRITE_FAILED" };
      },
    });

    if ("status" in receipt) {
      const { status: decisionStatus, ...transportReceipt } = receipt;
      json(response, 200, {
        ...transportReceipt,
        decisionStatus,
        status: receipt.idempotentReplay ? "replayed" : "recorded",
      });
    } else {
      json(response, 200, {
        ...receipt,
        status: receipt.idempotentReplay ? "replayed" : "recorded",
      });
    }
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      json(response, 401, { status: "authentication_required" });
      return;
    }
    if (error instanceof AuthenticationUnavailableError) {
      json(response, 503, { status: "authentication_unavailable" });
      return;
    }
    if (error instanceof DriftRequestError) {
      json(response, 400, { status: "invalid_request" });
      return;
    }
    if (error instanceof WebWriteIdempotencyError) {
      json(response, 400, { status: "idempotency_required" });
      return;
    }
    if (error instanceof DriftError) {
      mapDomainError(error, response);
      return;
    }
    json(response, 500, { status: "internal_error" });
  }
}
