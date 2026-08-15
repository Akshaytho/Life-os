import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { CanonicalCalendarReader } from "../../../packages/domain/canonical-calendar-read";
import type { InteractionChangeLedgerReader } from "../../../packages/domain/interaction-change-ledger";
import type { ProposalReviewReader } from "../../../packages/domain/proposal-review";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import { CanonicalCalendarReadError, getCanonicalCalendar } from "./get-canonical-calendar";
import { getCaptureProposalReview, ProposalReviewValidationError } from "./get-capture-proposal-review";
import { getInteractionChangeTrace, InteractionChangeTraceError } from "./get-interaction-change-trace";
import { appendVaryHeader } from "./private-cors";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";

export interface PrivateReadApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  proposalReviewReader: ProposalReviewReader;
  interactionLedgerReader: InteractionChangeLedgerReader;
  canonicalCalendarReader?: CanonicalCalendarReader;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

type PrivateReadRoute =
  | { kind: "PROPOSAL_REVIEW"; captureId: string }
  | { kind: "INTERACTION_TRACE"; captureId: string }
  | { kind: "CANONICAL_CALENDAR" };

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

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

function urlOf(request: IncomingMessage): URL {
  try {
    return new URL(request.url ?? "/", "http://life-os.invalid");
  } catch {
    return new URL("/invalid-request-target", "http://life-os.invalid");
  }
}

function pathOf(request: IncomingMessage): string {
  return urlOf(request).pathname;
}

function decodedOpaqueId(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value);
    return opaqueIdPattern.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function routeOf(request: IncomingMessage): PrivateReadRoute | undefined {
  const path = pathOf(request);

  if (path === "/api/v1/calendar" && request.method === "GET") return { kind: "CANONICAL_CALENDAR" };

  const review = /^\/api\/v1\/captures\/([^/]+)\/review$/.exec(path);
  if (review) {
    const captureId = decodedOpaqueId(review[1]);
    return captureId ? { kind: "PROPOSAL_REVIEW", captureId } : undefined;
  }

  const trace = /^\/api\/v1\/interactions\/([^/]+)\/trace$/.exec(path);
  if (trace) {
    const captureId = decodedOpaqueId(trace[1]);
    return captureId ? { kind: "INTERACTION_TRACE", captureId } : undefined;
  }

  return undefined;
}

function calendarRange(request: IncomingMessage): { from: string; to: string } {
  const searchParams = urlOf(request).searchParams;
  const keys = Array.from(searchParams.keys()).sort();
  if (keys.length !== 2 || keys[0] !== "from" || keys[1] !== "to") {
    throw new CanonicalCalendarReadError("Calendar read requires exactly one from and one to query parameter");
  }
  return {
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  };
}

function bearerCredential(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.length > 4096) return undefined;
  const match = /^Bearer ([^\s,]+)$/.exec(header);
  return match?.[1];
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
  if (error instanceof CanonicalCalendarReadError) {
    json(response, 400, { status: "invalid_calendar_window" });
    return;
  }
  if (error instanceof ProposalReviewValidationError || error instanceof InteractionChangeTraceError) {
    json(response, 500, { status: "internal_error" });
    return;
  }
  json(response, 500, { status: "internal_error" });
}

export async function handlePrivateReadRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateReadApiDependencies,
): Promise<void> {
  const route = routeOf(request);
  if (!route) {
    json(response, 404, { status: "not_found" });
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    json(response, 405, { status: "method_not_allowed" });
    return;
  }

  try {
    const context = await createTrustedWebRequestContext(
      { credential: bearerCredential(request) },
      {
        sessionVerifier: dependencies.sessionVerifier,
        clock: dependencies.transportClock,
        requestIds: dependencies.requestIds,
      },
    );

    if (route.kind === "PROPOSAL_REVIEW") {
      const review = await runInstrumentedOperation({
        operation: "GET_PROPOSAL_REVIEW",
        runtime: dependencies.runtime,
        telemetry: dependencies.telemetry,
        timer: dependencies.operationTimer,
        initialTrace: { requestId: context.requestId, captureId: route.captureId },
        async work() {
          const value = await getCaptureProposalReview(
            route.captureId,
            { principal: context.principal },
            { reader: dependencies.proposalReviewReader },
          );
          return { value, outcome: value ? "SUCCESS" : "UNAVAILABLE" };
        },
        classifyFailure() {
          return { outcome: "FAILED", errorCode: "PROPOSAL_REVIEW_READ_FAILED" };
        },
      });

      if (!review) {
        json(response, 404, { status: "not_found" });
        return;
      }
      json(response, 200, review);
      return;
    }

    if (route.kind === "CANONICAL_CALENDAR") {
      const reader = dependencies.canonicalCalendarReader;
      if (!reader) {
        json(response, 503, { status: "calendar_unavailable" });
        return;
      }

      const calendar = await runInstrumentedOperation({
        operation: "GET_CANONICAL_CALENDAR",
        runtime: dependencies.runtime,
        telemetry: dependencies.telemetry,
        timer: dependencies.operationTimer,
        initialTrace: { requestId: context.requestId },
        async work() {
          const value = await getCanonicalCalendar(
            calendarRange(request),
            { principal: context.principal },
            { reader },
          );
          return { value };
        },
        classifyFailure(error) {
          if (error instanceof CanonicalCalendarReadError) {
            return { outcome: "REJECTED", errorCode: "CANONICAL_CALENDAR_WINDOW_INVALID" };
          }
          return { outcome: "FAILED", errorCode: "CANONICAL_CALENDAR_READ_FAILED" };
        },
      });

      json(response, 200, calendar);
      return;
    }

    const trace = await runInstrumentedOperation({
      operation: "GET_INTERACTION_TRACE",
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId, captureId: route.captureId },
      async work() {
        const value = await getInteractionChangeTrace(
          route.captureId,
          context.principal,
          { reader: dependencies.interactionLedgerReader },
        );
        return { value, outcome: value ? "SUCCESS" : "UNAVAILABLE" };
      },
      classifyFailure() {
        return { outcome: "FAILED", errorCode: "INTERACTION_TRACE_READ_FAILED" };
      },
    });

    if (!trace) {
      json(response, 404, { status: "not_found" });
      return;
    }
    json(response, 200, trace);
  } catch (error) {
    mapFailure(error, response);
  }
}

export function createLifeOsPrivateReadServer(dependencies: PrivateReadApiDependencies): Server {
  return createServer((request, response) => {
    void handlePrivateReadRequest(request, response, dependencies);
  });
}
