import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type {
  Clock,
  RoutingIdGenerator,
  WriteUnitOfWork,
} from "../../../packages/domain/write-boundary";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import {
  CaptureProposalPersistenceError,
  captureAndPropose,
} from "./capture-and-propose";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";
import {
  WebWriteIdempotencyError,
  withWebWriteIdempotency,
} from "./web-write-idempotency";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_RAW_TEXT_LENGTH = 800;

export interface PrivateCaptureApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  unitOfWork: WriteUnitOfWork;
  interpreter: CaptureInterpreter;
  captureClock: Clock;
  routingIds: RoutingIdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

type RequestFailureKind =
  | "UNSUPPORTED_MEDIA_TYPE"
  | "REQUEST_TOO_LARGE"
  | "INVALID_REQUEST";

class PrivateCaptureRequestError extends Error {
  constructor(readonly kind: RequestFailureKind) {
    super(kind);
    this.name = "PrivateCaptureRequestError";
  }
}

function json(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("pragma", "no-cache");
  response.setHeader("vary", "Authorization, Idempotency-Key");
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
  if (encoding !== undefined && encoding !== "identity") {
    throw new PrivateCaptureRequestError("UNSUPPORTED_MEDIA_TYPE");
  }

  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string") {
    throw new PrivateCaptureRequestError("UNSUPPORTED_MEDIA_TYPE");
  }
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new PrivateCaptureRequestError("UNSUPPORTED_MEDIA_TYPE");
  }
}

async function readCaptureBody(request: IncomingMessage): Promise<{ rawText: string }> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new PrivateCaptureRequestError("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PrivateCaptureRequestError("INVALID_REQUEST");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PrivateCaptureRequestError("INVALID_REQUEST");
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "rawText") {
    throw new PrivateCaptureRequestError("INVALID_REQUEST");
  }
  if (typeof record.rawText !== "string" || !record.rawText.trim() || record.rawText.length > MAX_RAW_TEXT_LENGTH) {
    throw new PrivateCaptureRequestError("INVALID_REQUEST");
  }

  return { rawText: record.rawText };
}

function isIdempotencyConflict(error: unknown): boolean {
  return error instanceof CaptureProposalPersistenceError
    && error.message === "This request ID is already bound to different Capture content";
}

function mapFailure(error: unknown, response: ServerResponse) {
  if (error instanceof AuthenticationRequiredError) {
    json(response, 401, { status: "authentication_required" });
    return;
  }
  if (error instanceof AuthenticationUnavailableError) {
    json(response, 503, { status: "authentication_unavailable" });
    return;
  }
  if (error instanceof WebWriteIdempotencyError) {
    json(response, 400, { status: "invalid_idempotency_key" });
    return;
  }
  if (error instanceof PrivateCaptureRequestError) {
    if (error.kind === "UNSUPPORTED_MEDIA_TYPE") {
      json(response, 415, { status: "unsupported_media_type" });
      return;
    }
    if (error.kind === "REQUEST_TOO_LARGE") {
      json(response, 413, { status: "request_too_large" });
      return;
    }
    json(response, 400, { status: "invalid_request" });
    return;
  }
  if (isIdempotencyConflict(error)) {
    json(response, 409, { status: "idempotency_conflict" });
    return;
  }
  json(response, 500, { status: "capture_processing_failed" });
}

export async function handlePrivateCaptureRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateCaptureApiDependencies,
): Promise<void> {
  if (pathOf(request) !== "/api/v1/captures") {
    json(response, 404, { status: "not_found" });
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    json(response, 405, { status: "method_not_allowed" });
    return;
  }

  try {
    const trustedContext = await createTrustedWebRequestContext(
      { credential: bearerCredential(request) },
      {
        sessionVerifier: dependencies.sessionVerifier,
        clock: dependencies.transportClock,
        requestIds: dependencies.requestIds,
      },
    );

    const writeContext = withWebWriteIdempotency(
      trustedContext,
      "CAPTURE_CREATE",
      idempotencyKey(request),
    );

    requireJsonContentType(request);
    const input = await readCaptureBody(request);

    const receipt = await runInstrumentedOperation({
      operation: "CAPTURE_AND_PROPOSE",
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: writeContext.requestId },
      async work() {
        const value = await captureAndPropose(input, writeContext, {
          unitOfWork: dependencies.unitOfWork,
          interpreter: dependencies.interpreter,
          clock: dependencies.captureClock,
          ids: dependencies.routingIds,
        });
        return {
          value,
          trace: {
            captureId: value.captureId,
            correlationId: value.correlationId,
          },
        };
      },
      classifyFailure(error) {
        if (isIdempotencyConflict(error)) {
          return { outcome: "REJECTED", errorCode: "CAPTURE_IDEMPOTENCY_CONFLICT" };
        }
        return { outcome: "FAILED", errorCode: "CAPTURE_PROCESSING_FAILED" };
      },
    });

    json(response, receipt.idempotentReplay ? 200 : 201, {
      status: receipt.idempotentReplay ? "replayed" : "created",
      captureId: receipt.captureId,
      correlationId: receipt.correlationId,
      interpretationId: receipt.interpretationId,
      proposalIds: receipt.proposalIds,
      proposalStates: receipt.proposalStates,
    });
  } catch (error) {
    mapFailure(error, response);
  }
}

export function createLifeOsPrivateCaptureServer(dependencies: PrivateCaptureApiDependencies): Server {
  return createServer((request, response) => {
    void handlePrivateCaptureRequest(request, response, dependencies);
  });
}
