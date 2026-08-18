import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  GetMemoryOverviewCommand,
  MemoryKind,
  MemoryRelationship,
  MemorySourceDomain,
  RetainMemoryItemCommand,
  ReviseMemoryItemCommand,
} from "../../../packages/contracts/memory";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type { MemoryClock, MemoryIdGenerator, MemoryUnitOfWork } from "../../../packages/domain/memory";
import type { MemoryReader } from "../../../packages/domain/memory-read";
import type { SessionVerifier, TransportClock, TransportRequestIdGenerator } from "../../../packages/domain/trusted-transport-auth";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import { getMemoryOverview } from "./get-memory-overview";
import { MemoryError } from "./memory-validation";
import { appendVaryHeader } from "./private-cors";
import { retainMemoryItem } from "./retain-memory-item";
import { reviseMemoryItem } from "./revise-memory-item";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";
import { WebWriteIdempotencyError, withWebWriteIdempotency } from "./web-write-idempotency";

const MAX_BODY_BYTES = 16 * 1024;

export interface PrivateMemoryApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  memoryReader?: MemoryReader;
  memoryUnitOfWork?: MemoryUnitOfWork;
  memoryClock?: MemoryClock;
  memoryIds?: MemoryIdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class MemoryRequestError extends Error {}

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

function bearer(request: IncomingMessage) {
  const value = request.headers.authorization;
  return typeof value === "string" && value.length <= 4096 ? /^Bearer ([^\s,]+)$/.exec(value)?.[1] : undefined;
}

function idempotencyKey(request: IncomingMessage) {
  const value = request.headers["idempotency-key"];
  return typeof value === "string" ? value : undefined;
}

function requestUrl(request: IncomingMessage) {
  try { return new URL(request.url ?? "/", "http://life-os.invalid") }
  catch { throw new MemoryRequestError() }
}

function requireJson(request: IncomingMessage) {
  if (request.headers["content-encoding"] !== undefined && request.headers["content-encoding"] !== "identity") {
    throw new MemoryRequestError();
  }
  const value = request.headers["content-type"];
  if (typeof value !== "string" || value.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new MemoryRequestError();
  }
}

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new MemoryRequestError();
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch { throw new MemoryRequestError() }
}

function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const actual = Object.keys(value);
  if (required.some((key) => !actual.includes(key)) || actual.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new MemoryRequestError();
  }
}

function retainCommand(value: Record<string, unknown>): RetainMemoryItemCommand {
  keys(value, ["sourceDomain", "sourceEntityId", "kind", "title", "body", "relationship"], ["relatedRootId"]);
  if (Object.values(value).some((item) => typeof item !== "string")) throw new MemoryRequestError();
  return {
    sourceDomain: value.sourceDomain as MemorySourceDomain,
    sourceEntityId: value.sourceEntityId as string,
    kind: value.kind as MemoryKind,
    title: value.title as string,
    body: value.body as string,
    relationship: value.relationship as MemoryRelationship,
    ...(typeof value.relatedRootId === "string" ? { relatedRootId: value.relatedRootId } : {}),
  };
}

function reviseCommand(value: Record<string, unknown>): ReviseMemoryItemCommand {
  keys(value, ["expectedCurrentItemId", "kind", "title", "body"]);
  if (Object.values(value).some((item) => typeof item !== "string")) throw new MemoryRequestError();
  return {
    expectedCurrentItemId: value.expectedCurrentItemId as string,
    kind: value.kind as MemoryKind,
    title: value.title as string,
    body: value.body as string,
  };
}

function overviewCommand(url: URL, now: string): GetMemoryOverviewCommand {
  const allowed = ["timeZone", "q", "kind"];
  if ([...url.searchParams.keys()].some((key) => !allowed.includes(key))) throw new MemoryRequestError();
  for (const key of allowed) if (url.searchParams.getAll(key).length > 1) throw new MemoryRequestError();
  const timeZone = url.searchParams.get("timeZone");
  if (!timeZone) throw new MemoryRequestError();
  const query = url.searchParams.get("q") ?? undefined;
  const kind = url.searchParams.get("kind") ?? undefined;
  return {
    timeZone, now,
    ...(query !== undefined ? { query } : {}),
    ...(kind !== undefined ? { kind: kind as MemoryKind } : {}),
  };
}

function mapError(error: MemoryError, response: ServerResponse) {
  const conflict = [
    "IDEMPOTENCY_CONFLICT", "CANDIDATE_ALREADY_RETAINED", "CURRENT_MEMORY_CHANGED", "MEMORY_UNCHANGED",
  ].includes(error.code);
  const notFound = ["CANDIDATE_NOT_FOUND", "RELATED_MEMORY_NOT_FOUND"].includes(error.code);
  const status = error.code.toLowerCase();
  json(response, conflict ? 409 : notFound ? 404 : 400, { status });
}

export async function handlePrivateMemoryRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateMemoryApiDependencies,
) {
  try {
    const url = requestUrl(request);
    const reviseMatch = /^\/api\/v1\/memory\/items\/([^/]+)$/.exec(url.pathname);
    const isOverview = url.pathname === "/api/v1/memory";
    const isRetain = url.pathname === "/api/v1/memory/items";
    if (!isOverview && !isRetain && !reviseMatch) { json(response, 404, { status: "not_found" }); return }
    if ((isOverview && request.method !== "GET") || (isRetain && request.method !== "POST") || (reviseMatch && request.method !== "PUT")) {
      response.setHeader("allow", isOverview ? "GET" : isRetain ? "POST" : "PUT");
      json(response, 405, { status: "method_not_allowed" }); return;
    }
    const transport = await createTrustedWebRequestContext(
      { credential: bearer(request) },
      { sessionVerifier: dependencies.sessionVerifier, clock: dependencies.transportClock, requestIds: dependencies.requestIds },
    );
    if (isOverview) {
      if (!dependencies.memoryReader) { json(response, 503, { status: "memory_unavailable" }); return }
      const value = await runInstrumentedOperation({
        operation: "GET_MEMORY_OVERVIEW", runtime: dependencies.runtime,
        telemetry: dependencies.telemetry, timer: dependencies.operationTimer,
        initialTrace: { requestId: transport.requestId },
        async work() { return { value: await getMemoryOverview(
          overviewCommand(url, transport.receivedAt), transport.principal, dependencies.memoryReader!,
        ) } },
        classifyFailure(error) {
          return error instanceof MemoryError
            ? { outcome: "REJECTED", errorCode: error.code }
            : { outcome: "FAILED", errorCode: "MEMORY_READ_FAILED" };
        },
      });
      json(response, 200, value); return;
    }
    if ([...url.searchParams.keys()].length) throw new MemoryRequestError();
    if (!dependencies.memoryUnitOfWork || !dependencies.memoryClock || !dependencies.memoryIds) {
      json(response, 503, { status: "memory_unavailable" }); return;
    }
    requireJson(request);
    const parsed = await body(request);
    const operation = isRetain ? "MEMORY_RETAIN" : "MEMORY_REVISE";
    const context = withWebWriteIdempotency(transport, operation, idempotencyKey(request));
    const value = await runInstrumentedOperation({
      operation: isRetain ? "RETAIN_MEMORY_ITEM" : "REVISE_MEMORY_ITEM",
      runtime: dependencies.runtime, telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer, initialTrace: { requestId: context.requestId },
      async work() {
        const receipt = isRetain
          ? await retainMemoryItem(retainCommand(parsed), context, {
              unitOfWork: dependencies.memoryUnitOfWork!, clock: dependencies.memoryClock!, ids: dependencies.memoryIds!,
            })
          : await reviseMemoryItem(decodeURIComponent(reviseMatch![1]!), reviseCommand(parsed), context, {
              unitOfWork: dependencies.memoryUnitOfWork!, clock: dependencies.memoryClock!, ids: dependencies.memoryIds!,
            });
        return { value: receipt };
      },
      classifyFailure(error) {
        return error instanceof MemoryError
          ? { outcome: "REJECTED", errorCode: error.code }
          : { outcome: "FAILED", errorCode: "MEMORY_WRITE_FAILED" };
      },
    });
    json(response, 200, { ...value, status: value.idempotentReplay ? "replayed" : "recorded" });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) { json(response, 401, { status: "authentication_required" }); return }
    if (error instanceof AuthenticationUnavailableError) { json(response, 503, { status: "authentication_unavailable" }); return }
    if (error instanceof WebWriteIdempotencyError) { json(response, 400, { status: "idempotency_required" }); return }
    if (error instanceof MemoryError) { mapError(error, response); return }
    if (error instanceof MemoryRequestError || error instanceof URIError) { json(response, 400, { status: "invalid_request" }); return }
    json(response, 500, { status: "internal_error" });
  }
}
