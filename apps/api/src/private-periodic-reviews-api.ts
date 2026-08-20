import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  GetPeriodicReviewOverviewCommand,
  PeriodicReviewKind,
  SubmitPeriodicReviewCommand,
} from "../../../packages/contracts/periodic-reviews";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type { BrainDumpNotNowReader } from "../../../packages/domain/brain-dump-not-now-read";
import type { CanonicalCalendarReader } from "../../../packages/domain/canonical-calendar-read";
import type { DailyReturnReader } from "../../../packages/domain/daily-return-read";
import type { DriftReader } from "../../../packages/domain/drift-return-read";
import type { JourneyPracticeReader } from "../../../packages/domain/journey-practice-read";
import type {
  PeriodicReviewClock,
  PeriodicReviewIdGenerator,
  PeriodicReviewUnitOfWork,
} from "../../../packages/domain/periodic-reviews";
import type { PeriodicReviewReader } from "../../../packages/domain/periodic-reviews-read";
import type { SessionVerifier, TransportClock, TransportRequestIdGenerator } from "../../../packages/domain/trusted-transport-auth";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import { getPeriodicReviewOverview } from "./get-periodic-review-overview";
import { PeriodicReviewsError } from "./periodic-reviews-validation";
import { appendVaryHeader } from "./private-cors";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import { submitPeriodicReview } from "./submit-periodic-review";
import type { TechnicalTelemetrySink } from "./technical-telemetry";
import {
  WebWriteIdempotencyError,
  withWebWriteIdempotency,
} from "./web-write-idempotency";

const MAX_BODY_BYTES = 36 * 1024;

export interface PrivatePeriodicReviewsApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  periodicReviewReader?: PeriodicReviewReader;
  dailyReturnReader?: DailyReturnReader;
  canonicalCalendarReader?: CanonicalCalendarReader;
  journeyPracticeReader?: JourneyPracticeReader;
  driftReader?: DriftReader;
  brainDumpNotNowReader?: BrainDumpNotNowReader;
  periodicReviewUnitOfWork?: PeriodicReviewUnitOfWork;
  periodicReviewClock?: PeriodicReviewClock;
  periodicReviewIds?: PeriodicReviewIdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class PeriodicReviewRequestError extends Error {}

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

function bearerCredential(request: IncomingMessage) {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.length > 4096) return undefined;
  return /^Bearer ([^\s,]+)$/.exec(header)?.[1];
}

function idempotencyKey(request: IncomingMessage) {
  const value = request.headers["idempotency-key"];
  return typeof value === "string" ? value : undefined;
}

function routeUrl(request: IncomingMessage) {
  try { return new URL(request.url ?? "/", "http://life-os.invalid") }
  catch { throw new PeriodicReviewRequestError() }
}

function exactSearch(url: URL, keys: string[]) {
  const actual = [...url.searchParams.keys()].sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new PeriodicReviewRequestError();
  }
}

function overviewCommand(url: URL): GetPeriodicReviewOverviewCommand {
  exactSearch(url, ["kind", "periodStart", "periodEnd", "timeZone", "calendarFrom", "calendarTo"]);
  const values = Object.fromEntries(url.searchParams);
  if (Object.values(values).some((value) => typeof value !== "string")) throw new PeriodicReviewRequestError();
  return {
    kind: values.kind as PeriodicReviewKind,
    periodStart: values.periodStart!,
    periodEnd: values.periodEnd!,
    timeZone: values.timeZone!,
    calendarFrom: values.calendarFrom!,
    calendarTo: values.calendarTo!,
  };
}

function requireJson(request: IncomingMessage) {
  const encoding = request.headers["content-encoding"];
  if (encoding !== undefined && encoding !== "identity") throw new PeriodicReviewRequestError();
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string"
    || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new PeriodicReviewRequestError();
  }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new PeriodicReviewRequestError();
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch { throw new PeriodicReviewRequestError() }
}

function exactKeys(body: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(body).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new PeriodicReviewRequestError();
  }
}

function submitCommand(body: Record<string, unknown>): SubmitPeriodicReviewCommand {
  const optional = body.worthPreserving === undefined ? [] : ["worthPreserving"];
  exactKeys(body, [
    "kind", "periodStart", "periodEnd", "timeZone", "whatMattered", "whatChanged",
    "whatMovedForward", "driftAndReturn", "whatWasLearned", "carryForward",
    "expectedCurrentReviewId", ...optional,
  ]);
  const stringKeys = [
    "kind", "periodStart", "periodEnd", "timeZone", "whatMattered", "whatChanged",
    "whatMovedForward", "driftAndReturn", "whatWasLearned", "carryForward",
  ];
  if (stringKeys.some((key) => typeof body[key] !== "string")
    || (body.expectedCurrentReviewId !== null && typeof body.expectedCurrentReviewId !== "string")
    || (body.worthPreserving !== undefined && typeof body.worthPreserving !== "string")) {
    throw new PeriodicReviewRequestError();
  }
  return {
    kind: body.kind as PeriodicReviewKind,
    periodStart: body.periodStart as string,
    periodEnd: body.periodEnd as string,
    timeZone: body.timeZone as string,
    whatMattered: body.whatMattered as string,
    whatChanged: body.whatChanged as string,
    whatMovedForward: body.whatMovedForward as string,
    driftAndReturn: body.driftAndReturn as string,
    whatWasLearned: body.whatWasLearned as string,
    carryForward: body.carryForward as string,
    ...(typeof body.worthPreserving === "string" ? { worthPreserving: body.worthPreserving } : {}),
    expectedCurrentReviewId: body.expectedCurrentReviewId as string | null,
  };
}

function mapDomainError(error: PeriodicReviewsError, response: ServerResponse) {
  const conflict = new Map([
    ["IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["CURRENT_REVIEW_CHANGED", "current_review_changed"],
    ["REVIEW_UNCHANGED", "review_unchanged"],
  ]).get(error.code);
  if (conflict) { json(response, 409, { status: conflict }); return }
  if (error.code === "PERIODIC_REVIEW_LIMIT_EXCEEDED") {
    json(response, 409, { status: "period_source_limit_exceeded" }); return;
  }
  json(response, 400, { status: "invalid_request" });
}

export async function handlePrivatePeriodicReviewsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivatePeriodicReviewsApiDependencies,
): Promise<void> {
  try {
    const url = routeUrl(request);
    if (url.pathname !== "/api/v1/reviews/period") {
      json(response, 404, { status: "not_found" }); return;
    }
    if (request.method !== "GET" && request.method !== "PUT") {
      response.setHeader("allow", "GET, PUT");
      json(response, 405, { status: "method_not_allowed" }); return;
    }
    const transport = await createTrustedWebRequestContext(
      { credential: bearerCredential(request) },
      { sessionVerifier: dependencies.sessionVerifier, clock: dependencies.transportClock, requestIds: dependencies.requestIds },
    );
    if (request.method === "GET") {
      const { periodicReviewReader, dailyReturnReader, canonicalCalendarReader,
        journeyPracticeReader, driftReader, brainDumpNotNowReader } = dependencies;
      if (!periodicReviewReader || !dailyReturnReader || !canonicalCalendarReader
        || !journeyPracticeReader || !driftReader || !brainDumpNotNowReader) {
        json(response, 503, { status: "periodic_reviews_unavailable" }); return;
      }
      const value = await runInstrumentedOperation({
        operation: "GET_PERIODIC_REVIEW_OVERVIEW", runtime: dependencies.runtime,
        telemetry: dependencies.telemetry, timer: dependencies.operationTimer,
        initialTrace: { requestId: transport.requestId },
        async work() {
          return { value: await getPeriodicReviewOverview(overviewCommand(url), transport.principal, {
            periodicReviewReader, dailyReturnReader, calendarReader: canonicalCalendarReader,
            journeyPracticeReader, driftReader, brainDumpNotNowReader,
          }) };
        },
        classifyFailure(error) {
          return error instanceof PeriodicReviewsError
            ? { outcome: "REJECTED", errorCode: error.code }
            : { outcome: "FAILED", errorCode: "PERIODIC_REVIEW_READ_FAILED" };
        },
      });
      json(response, 200, value); return;
    }
    exactSearch(url, []);
    const { periodicReviewUnitOfWork, periodicReviewClock, periodicReviewIds } = dependencies;
    if (!periodicReviewUnitOfWork || !periodicReviewClock || !periodicReviewIds) {
      json(response, 503, { status: "periodic_reviews_unavailable" }); return;
    }
    requireJson(request);
    const body = await readBody(request);
    const context = withWebWriteIdempotency(
      transport, "PERIODIC_REVIEW_SUBMIT", idempotencyKey(request),
    );
    const receipt = await runInstrumentedOperation({
      operation: "SUBMIT_PERIODIC_REVIEW", runtime: dependencies.runtime,
      telemetry: dependencies.telemetry, timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId },
      async work() {
        return { value: await submitPeriodicReview(submitCommand(body), context, {
          unitOfWork: periodicReviewUnitOfWork, clock: periodicReviewClock, ids: periodicReviewIds,
        }) };
      },
      classifyFailure(error) {
        return error instanceof PeriodicReviewsError
          ? { outcome: "REJECTED", errorCode: error.code }
          : { outcome: "FAILED", errorCode: "PERIODIC_REVIEW_WRITE_FAILED" };
      },
    });
    json(response, 200, { ...receipt, status: receipt.idempotentReplay ? "replayed" : "recorded" });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      json(response, 401, { status: "authentication_required" }); return;
    }
    if (error instanceof AuthenticationUnavailableError) {
      json(response, 503, { status: "authentication_unavailable" }); return;
    }
    if (error instanceof PeriodicReviewsError) { mapDomainError(error, response); return }
    if (error instanceof WebWriteIdempotencyError) {
      json(response, 400, { status: "idempotency_required" }); return;
    }
    if (error instanceof PeriodicReviewRequestError) {
      json(response, 400, { status: "invalid_request" }); return;
    }
    json(response, 500, { status: "internal_error" });
  }
}
