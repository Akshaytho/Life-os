import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AppendDailyLogEntryCommand,
  DailyReturnState,
  SubmitDailyReturnReviewCommand,
} from "../../../packages/contracts/daily-return";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type {
  DailyReturnClock,
  DailyReturnIdGenerator,
  DailyReturnUnitOfWork,
} from "../../../packages/domain/daily-return";
import type { DailyReturnReader } from "../../../packages/domain/daily-return-read";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import { appendDailyLogEntry } from "./append-daily-log-entry";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import { DailyReturnError } from "./daily-return-validation";
import {
  DailyReturnOverviewReadError,
  getDailyReturnOverview,
} from "./get-daily-return-overview";
import { appendVaryHeader } from "./private-cors";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import { submitDailyReturnReview } from "./submit-daily-return-review";
import type { TechnicalTelemetrySink } from "./technical-telemetry";
import {
  WebWriteIdempotencyError,
  withWebWriteIdempotency,
} from "./web-write-idempotency";

const MAX_BODY_BYTES = 24 * 1024;

export interface PrivateDailyReturnApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  dailyReturnReader?: DailyReturnReader;
  dailyReturnUnitOfWork?: DailyReturnUnitOfWork;
  dailyReturnClock?: DailyReturnClock;
  dailyReturnIds?: DailyReturnIdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class DailyReturnRequestError extends Error {}

type DailyReturnRoute = "OVERVIEW" | "APPEND_LOG" | "SUBMIT_REVIEW";

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
    throw new DailyReturnRequestError();
  }
}

function routeOf(request: IncomingMessage): DailyReturnRoute | undefined {
  const path = parsedUrl(request).pathname;
  if (path === "/api/v1/daily-return") return "OVERVIEW";
  if (path === "/api/v1/daily-return/logs") return "APPEND_LOG";
  if (path === "/api/v1/daily-return/review") return "SUBMIT_REVIEW";
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

function overviewDate(request: IncomingMessage): string {
  const url = parsedUrl(request);
  if ([...url.searchParams.keys()].some((key) => key !== "date")) {
    throw new DailyReturnRequestError();
  }
  const values = url.searchParams.getAll("date");
  if (values.length !== 1 || !values[0]) throw new DailyReturnRequestError();
  return values[0];
}

function requireJsonContentType(request: IncomingMessage) {
  const encoding = request.headers["content-encoding"];
  if (encoding !== undefined && encoding !== "identity") {
    throw new DailyReturnRequestError();
  }
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string"
    || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
  ) {
    throw new DailyReturnRequestError();
  }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new DailyReturnRequestError();
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new DailyReturnRequestError();
  }
}

function exactKeys(body: Record<string, unknown>, expected: string[]): void {
  const actual = Object.keys(body).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new DailyReturnRequestError();
  }
}

function logCommandFromBody(body: Record<string, unknown>): AppendDailyLogEntryCommand {
  exactKeys(body, ["body", "localDate", "timeZone"]);
  if (
    typeof body.localDate !== "string"
    || typeof body.timeZone !== "string"
    || typeof body.body !== "string"
  ) {
    throw new DailyReturnRequestError();
  }
  return {
    localDate: body.localDate,
    timeZone: body.timeZone,
    body: body.body,
  };
}

function reviewCommandFromBody(body: Record<string, unknown>): SubmitDailyReturnReviewCommand {
  exactKeys(body, [
    "expectedCurrentReviewId",
    "localDate",
    "returnState",
    "returnToTomorrow",
    "timeZone",
    "whatHappened",
    "whatMovedForward",
    "whatPulledMeAway",
  ]);
  if (
    typeof body.localDate !== "string"
    || typeof body.timeZone !== "string"
    || typeof body.whatHappened !== "string"
    || typeof body.whatMovedForward !== "string"
    || typeof body.whatPulledMeAway !== "string"
    || typeof body.returnToTomorrow !== "string"
    || typeof body.returnState !== "string"
    || (
      body.expectedCurrentReviewId !== null
      && typeof body.expectedCurrentReviewId !== "string"
    )
  ) {
    throw new DailyReturnRequestError();
  }
  return {
    localDate: body.localDate,
    timeZone: body.timeZone,
    whatHappened: body.whatHappened,
    whatMovedForward: body.whatMovedForward,
    whatPulledMeAway: body.whatPulledMeAway,
    returnToTomorrow: body.returnToTomorrow,
    returnState: body.returnState as DailyReturnState,
    expectedCurrentReviewId: body.expectedCurrentReviewId,
  };
}

function mapDailyReturnError(error: DailyReturnError, response: ServerResponse) {
  if (error.code === "CURRENT_REVIEW_CHANGED") {
    json(response, 409, { status: "current_review_changed" });
    return;
  }
  if (error.code === "REVIEW_UNCHANGED") {
    json(response, 409, { status: "review_unchanged" });
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
  json(response, 400, { status: "invalid_daily_return" });
}

export async function handlePrivateDailyReturnRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateDailyReturnApiDependencies,
): Promise<void> {
  try {
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

    const transportContext = await createTrustedWebRequestContext(
      { credential: bearerCredential(request) },
      {
        sessionVerifier: dependencies.sessionVerifier,
        clock: dependencies.transportClock,
        requestIds: dependencies.requestIds,
      },
    );

    if (route === "OVERVIEW") {
      const reader = dependencies.dailyReturnReader;
      if (!reader) {
        json(response, 503, { status: "daily_return_unavailable" });
        return;
      }
      const overview = await runInstrumentedOperation({
        operation: "GET_DAILY_RETURN_OVERVIEW",
        runtime: dependencies.runtime,
        telemetry: dependencies.telemetry,
        timer: dependencies.operationTimer,
        initialTrace: { requestId: transportContext.requestId },
        async work() {
          const value = await getDailyReturnOverview(
            {
              principal: transportContext.principal,
              localDate: overviewDate(request),
            },
            { reader },
          );
          return { value };
        },
        classifyFailure(error) {
          if (error instanceof DailyReturnOverviewReadError) {
            return { outcome: "REJECTED", errorCode: error.code };
          }
          return { outcome: "FAILED", errorCode: "DAILY_RETURN_READ_FAILED" };
        },
      });
      json(response, 200, overview);
      return;
    }

    const unitOfWork = dependencies.dailyReturnUnitOfWork;
    const clock = dependencies.dailyReturnClock;
    const ids = dependencies.dailyReturnIds;
    if (!unitOfWork || !clock || !ids) {
      json(response, 503, { status: "daily_return_mutation_unavailable" });
      return;
    }

    requireJsonContentType(request);
    const body = await readBody(request);
    const scope = route === "APPEND_LOG" ? "DAILY_LOG_APPEND" : "DAILY_RETURN_SUBMIT";
    const context = withWebWriteIdempotency(
      transportContext,
      scope,
      idempotencyKey(request),
    );

    if (route === "APPEND_LOG") {
      const receipt = await runInstrumentedOperation({
        operation: "APPEND_DAILY_LOG_ENTRY",
        runtime: dependencies.runtime,
        telemetry: dependencies.telemetry,
        timer: dependencies.operationTimer,
        initialTrace: { requestId: context.requestId },
        async work() {
          const value = await appendDailyLogEntry(logCommandFromBody(body), context, {
            unitOfWork,
            clock,
            ids,
          });
          return { value };
        },
        classifyFailure(error) {
          if (error instanceof DailyReturnError) {
            return { outcome: "REJECTED", errorCode: error.code };
          }
          return { outcome: "FAILED", errorCode: "DAILY_LOG_APPEND_FAILED" };
        },
      });
      json(response, 200, {
        status: receipt.idempotentReplay ? "replayed" : "recorded",
        entryId: receipt.entryId,
        authorityClass: receipt.authorityClass,
        occurredAt: receipt.occurredAt,
        recordedAt: receipt.recordedAt,
      });
      return;
    }

    const receipt = await runInstrumentedOperation({
      operation: "SUBMIT_DAILY_RETURN_REVIEW",
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId },
      async work() {
        const value = await submitDailyReturnReview(reviewCommandFromBody(body), context, {
          unitOfWork,
          clock,
          ids,
        });
        return { value };
      },
      classifyFailure(error) {
        if (error instanceof DailyReturnError) {
          return { outcome: "REJECTED", errorCode: error.code };
        }
        return { outcome: "FAILED", errorCode: "DAILY_RETURN_SUBMIT_FAILED" };
      },
    });
    json(response, 200, {
      status: receipt.idempotentReplay ? "replayed" : "current",
      reviewId: receipt.reviewId,
      authorityClass: receipt.authorityClass,
      submittedAt: receipt.submittedAt,
      recordedAt: receipt.recordedAt,
      ...(receipt.supersededReviewId
        ? { supersededReviewId: receipt.supersededReviewId }
        : {}),
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
    if (error instanceof DailyReturnRequestError) {
      json(response, 400, { status: "invalid_request" });
      return;
    }
    if (error instanceof WebWriteIdempotencyError) {
      json(response, 400, { status: "idempotency_required" });
      return;
    }
    if (error instanceof DailyReturnError) {
      mapDailyReturnError(error, response);
      return;
    }
    if (error instanceof DailyReturnOverviewReadError) {
      if (error.code === "INVALID_DATE") {
        json(response, 400, { status: "invalid_date" });
        return;
      }
      json(response, 500, { status: "internal_error" });
      return;
    }
    json(response, 500, { status: "internal_error" });
  }
}
