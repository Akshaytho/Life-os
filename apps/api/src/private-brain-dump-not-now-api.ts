import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  BrainDumpCategory,
  NotNowAssessment,
  NotNowPosture,
  NotNowState,
  ParkNotNowItemCommand,
  ReviewNotNowItemCommand,
} from "../../../packages/contracts/brain-dump-not-now";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type {
  BrainDumpNotNowClock,
  BrainDumpNotNowIdGenerator,
  BrainDumpNotNowUnitOfWork,
} from "../../../packages/domain/brain-dump-not-now";
import type { BrainDumpNotNowReader } from "../../../packages/domain/brain-dump-not-now-read";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import { BrainDumpNotNowError } from "./brain-dump-not-now-validation";
import { confirmBrainDumpClassification } from "./confirm-brain-dump-classification";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import {
  getBrainDumpOverview,
  getNotNowOverview,
} from "./get-brain-dump-not-now-overviews";
import { parkNotNowItem } from "./park-not-now-item";
import { appendVaryHeader } from "./private-cors";
import { reviewNotNowItem } from "./review-not-now-item";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";
import {
  WebWriteIdempotencyError,
  withWebWriteIdempotency,
  type WebWriteIdempotencyScope,
} from "./web-write-idempotency";

const MAX_BODY_BYTES = 24 * 1024;

export interface PrivateBrainDumpNotNowApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  brainDumpNotNowReader?: BrainDumpNotNowReader;
  brainDumpNotNowUnitOfWork?: BrainDumpNotNowUnitOfWork;
  brainDumpNotNowClock?: BrainDumpNotNowClock;
  brainDumpNotNowIds?: BrainDumpNotNowIdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class BrainDumpNotNowRequestError extends Error {}

type Route =
  | { kind: "BRAIN_DUMP_OVERVIEW" }
  | { kind: "CLASSIFY"; captureId: string }
  | { kind: "NOT_NOW_OVERVIEW" }
  | { kind: "PARK" }
  | { kind: "REVIEW"; rootId: string };

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

function parsedUrl(request: IncomingMessage): URL {
  try {
    return new URL(request.url ?? "/", "http://life-os.invalid");
  } catch {
    throw new BrainDumpNotNowRequestError();
  }
}

function routeOf(request: IncomingMessage): Route | undefined {
  const url = parsedUrl(request);
  if ([...url.searchParams.keys()].length > 0) throw new BrainDumpNotNowRequestError();
  const path = url.pathname;
  if (path === "/api/v1/brain-dump") return { kind: "BRAIN_DUMP_OVERVIEW" };
  const classification = /^\/api\/v1\/brain-dump\/([^/]+)\/classification$/.exec(path);
  if (classification) return { kind: "CLASSIFY", captureId: decodedPathId(classification[1]!) };
  if (path === "/api/v1/not-now") {
    return request.method === "GET" ? { kind: "NOT_NOW_OVERVIEW" } : { kind: "PARK" };
  }
  const review = /^\/api\/v1\/not-now\/([^/]+)\/review$/.exec(path);
  if (review) return { kind: "REVIEW", rootId: decodedPathId(review[1]!) };
  return undefined;
}

function decodedPathId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new BrainDumpNotNowRequestError();
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
  if (encoding !== undefined && encoding !== "identity") throw new BrainDumpNotNowRequestError();
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string"
    || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
  ) {
    throw new BrainDumpNotNowRequestError();
  }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new BrainDumpNotNowRequestError();
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new BrainDumpNotNowRequestError();
  }
}

function exactKeys(body: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(body).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new BrainDumpNotNowRequestError();
  }
}

function classificationCommand(body: Record<string, unknown>) {
  exactKeys(body, ["category", "expectedCurrentClassificationId"]);
  if (
    typeof body.category !== "string"
    || (body.expectedCurrentClassificationId !== null
      && typeof body.expectedCurrentClassificationId !== "string")
  ) throw new BrainDumpNotNowRequestError();
  return {
    category: body.category as BrainDumpCategory,
    expectedCurrentClassificationId: body.expectedCurrentClassificationId,
  };
}

function parkCommand(body: Record<string, unknown>): ParkNotNowItemCommand {
  exactKeys(body, [
    "assessment",
    "captureId",
    "classificationId",
    "expectedCurrentItemId",
    "posture",
  ]);
  if (
    typeof body.captureId !== "string"
    || typeof body.classificationId !== "string"
    || typeof body.assessment !== "string"
    || typeof body.posture !== "string"
    || body.expectedCurrentItemId !== null
  ) throw new BrainDumpNotNowRequestError();
  return {
    captureId: body.captureId,
    classificationId: body.classificationId,
    assessment: body.assessment as NotNowAssessment,
    posture: body.posture as NotNowPosture,
    expectedCurrentItemId: null,
  };
}

function reviewCommand(body: Record<string, unknown>): ReviewNotNowItemCommand {
  const expected = body.reviewNote === undefined
    ? ["expectedCurrentRevision", "targetState"]
    : ["expectedCurrentRevision", "reviewNote", "targetState"];
  exactKeys(body, expected);
  if (
    typeof body.targetState !== "string"
    || typeof body.expectedCurrentRevision !== "number"
    || (body.reviewNote !== undefined && typeof body.reviewNote !== "string")
  ) throw new BrainDumpNotNowRequestError();
  return {
    targetState: body.targetState as NotNowState,
    expectedCurrentRevision: body.expectedCurrentRevision,
    ...(typeof body.reviewNote === "string" ? { reviewNote: body.reviewNote } : {}),
  };
}

function expectedMethod(route: Route): "GET" | "POST" {
  return route.kind === "BRAIN_DUMP_OVERVIEW" || route.kind === "NOT_NOW_OVERVIEW"
    ? "GET"
    : "POST";
}

function writeScope(route: Route): WebWriteIdempotencyScope {
  if (route.kind === "CLASSIFY") return "BRAIN_DUMP_CLASSIFY";
  if (route.kind === "PARK") return "NOT_NOW_PARK";
  return "NOT_NOW_REVIEW";
}

function mapDomainError(error: BrainDumpNotNowError, response: ServerResponse) {
  if (error.code === "CAPTURE_NOT_FOUND" || error.code === "NOT_NOW_ITEM_NOT_FOUND") {
    json(response, 404, { status: "not_found" });
    return;
  }
  const conflicts = new Map([
    ["IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["CURRENT_CLASSIFICATION_CHANGED", "current_classification_changed"],
    ["CLASSIFICATION_UNCHANGED", "classification_unchanged"],
    ["NOT_NOW_ITEM_EXISTS", "not_now_item_exists"],
    ["NOT_NOW_ITEM_CHANGED", "not_now_item_changed"],
    ["NOT_NOW_TRANSITION_NOT_ALLOWED", "not_now_transition_not_allowed"],
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
  if (error.code === "NOT_NOW_CLASSIFICATION_REQUIRED") {
    json(response, 409, { status: "not_now_classification_required" });
    return;
  }
  json(response, 400, { status: "invalid_brain_dump_not_now" });
}

export async function handlePrivateBrainDumpNotNowRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateBrainDumpNotNowApiDependencies,
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

    if (route.kind === "BRAIN_DUMP_OVERVIEW" || route.kind === "NOT_NOW_OVERVIEW") {
      const reader = dependencies.brainDumpNotNowReader;
      if (!reader) {
        json(response, 503, { status: "brain_dump_not_now_unavailable" });
        return;
      }
      const operation = route.kind === "BRAIN_DUMP_OVERVIEW"
        ? "GET_BRAIN_DUMP_OVERVIEW"
        : "GET_NOT_NOW_OVERVIEW";
      const value = await runInstrumentedOperation({
        operation,
        runtime: dependencies.runtime,
        telemetry: dependencies.telemetry,
        timer: dependencies.operationTimer,
        initialTrace: { requestId: transportContext.requestId },
        async work() {
          return { value: route.kind === "BRAIN_DUMP_OVERVIEW"
            ? await getBrainDumpOverview(transportContext.principal.userId, reader)
            : await getNotNowOverview(transportContext.principal.userId, reader) };
        },
        classifyFailure(error) {
          return error instanceof BrainDumpNotNowError
            ? { outcome: "REJECTED", errorCode: error.code }
            : { outcome: "FAILED", errorCode: "BRAIN_DUMP_NOT_NOW_READ_FAILED" };
        },
      });
      json(response, 200, value);
      return;
    }

    const unitOfWork = dependencies.brainDumpNotNowUnitOfWork;
    const clock = dependencies.brainDumpNotNowClock;
    const ids = dependencies.brainDumpNotNowIds;
    if (!unitOfWork || !clock || !ids) {
      json(response, 503, { status: "brain_dump_not_now_mutation_unavailable" });
      return;
    }
    requireJsonContentType(request);
    const body = await readBody(request);
    const context = withWebWriteIdempotency(
      transportContext,
      writeScope(route),
      idempotencyKey(request),
    );
    const operation = route.kind === "CLASSIFY"
      ? "CONFIRM_BRAIN_DUMP_CLASSIFICATION"
      : route.kind === "PARK"
        ? "PARK_NOT_NOW_ITEM"
        : "REVIEW_NOT_NOW_ITEM";
    const receipt = await runInstrumentedOperation({
      operation,
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: {
        requestId: context.requestId,
        ...(route.kind === "CLASSIFY" ? { captureId: route.captureId } : {}),
      },
      async work() {
        const value = route.kind === "CLASSIFY"
          ? await confirmBrainDumpClassification(route.captureId, classificationCommand(body), context, {
            unitOfWork, clock, ids,
          })
          : route.kind === "PARK"
            ? await parkNotNowItem(parkCommand(body), context, { unitOfWork, clock, ids })
            : await reviewNotNowItem(route.rootId, reviewCommand(body), context, {
              unitOfWork, clock, ids,
            });
        return { value };
      },
      classifyFailure(error) {
        return error instanceof BrainDumpNotNowError
          ? { outcome: "REJECTED", errorCode: error.code }
          : { outcome: "FAILED", errorCode: "BRAIN_DUMP_NOT_NOW_WRITE_FAILED" };
      },
    });
    const { status: decisionStatus, ...transportReceipt } = receipt;
    json(response, 200, {
      ...transportReceipt,
      decisionStatus,
      status: receipt.idempotentReplay ? "replayed" : "recorded",
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
    if (error instanceof BrainDumpNotNowRequestError) {
      json(response, 400, { status: "invalid_request" });
      return;
    }
    if (error instanceof WebWriteIdempotencyError) {
      json(response, 400, { status: "idempotency_required" });
      return;
    }
    if (error instanceof BrainDumpNotNowError) {
      mapDomainError(error, response);
      return;
    }
    json(response, 500, { status: "internal_error" });
  }
}
