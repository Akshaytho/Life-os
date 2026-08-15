import type { IncomingMessage, ServerResponse } from "node:http";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type { Clock } from "../../../packages/domain/write-boundary";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import {
  CalendarProposalConfirmationError,
  confirmCalendarProposal,
  type CalendarProposalConfirmationStore,
  type ConfirmCalendarProposalCommand,
} from "./confirm-calendar-proposal";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import { appendVaryHeader } from "./private-cors";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";

const MAX_BODY_BYTES = 6 * 1024;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export interface PrivateCalendarConfirmationApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  calendarConfirmationStore: CalendarProposalConfirmationStore;
  mutationClock: Clock;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class CalendarConfirmationRequestError extends Error {}

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

function proposalIdOf(request: IncomingMessage): string | undefined {
  const match = /^\/api\/v1\/proposals\/([^/]+)\/confirm-calendar$/.exec(pathOf(request));
  if (!match) return undefined;
  try {
    const decoded = decodeURIComponent(match[1]);
    return opaqueIdPattern.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function bearerCredential(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.length > 4096) return undefined;
  return /^Bearer ([^\s,]+)$/.exec(header)?.[1];
}

function requireJsonContentType(request: IncomingMessage) {
  const encoding = request.headers["content-encoding"];
  if (encoding !== undefined && encoding !== "identity") throw new CalendarConfirmationRequestError();
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new CalendarConfirmationRequestError();
  }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new CalendarConfirmationRequestError();
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new CalendarConfirmationRequestError();
  }
}

function commandFromBody(proposalId: string, body: Record<string, unknown>): ConfirmCalendarProposalCommand {
  if (Object.keys(body).length !== 1 || !body.plan || typeof body.plan !== "object" || Array.isArray(body.plan)) {
    throw new CalendarConfirmationRequestError();
  }
  const plan = body.plan as Record<string, unknown>;
  const expected = ["title", "startsAt", "endsAt", "category", "commitment", "timeZone"].sort();
  const actual = Object.keys(plan).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new CalendarConfirmationRequestError();
  }
  return {
    proposalId,
    plan: {
      title: plan.title as string,
      startsAt: plan.startsAt as string,
      endsAt: plan.endsAt as string,
      category: plan.category as ConfirmCalendarProposalCommand["plan"]["category"],
      commitment: plan.commitment as ConfirmCalendarProposalCommand["plan"]["commitment"],
      timeZone: plan.timeZone as string,
    },
  };
}

export async function handlePrivateCalendarConfirmationRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateCalendarConfirmationApiDependencies,
): Promise<void> {
  const proposalId = proposalIdOf(request);
  if (!proposalId) {
    json(response, 404, { status: "not_found" });
    return;
  }
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
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
    requireJsonContentType(request);
    const command = commandFromBody(proposalId, await readBody(request));

    const receipt = await runInstrumentedOperation({
      operation: "CONFIRM_CALENDAR_PROPOSAL",
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId, proposalId },
      async work() {
        const value = await confirmCalendarProposal(command, context, {
          store: dependencies.calendarConfirmationStore,
          clock: dependencies.mutationClock,
        });
        return { value, trace: { proposalId: value.proposalId } };
      },
      classifyFailure(error) {
        if (error instanceof CalendarProposalConfirmationError) {
          if (error.code === "PROPOSAL_UNAVAILABLE") return { outcome: "UNAVAILABLE", errorCode: "CALENDAR_CONFIRMATION_UNAVAILABLE" };
          if (error.code === "INVALID_REQUEST") return { outcome: "REJECTED", errorCode: "CALENDAR_CONFIRMATION_INVALID" };
          return { outcome: "REJECTED", errorCode: "CALENDAR_CONFIRMATION_CONFLICT" };
        }
        return { outcome: "FAILED", errorCode: "CALENDAR_CONFIRMATION_FAILED" };
      },
    });

    json(response, 200, {
      status: receipt.idempotentReplay ? "replayed" : "ready_to_apply",
      proposalId: receipt.proposalId,
      state: receipt.state,
      confirmedAt: receipt.confirmedAt,
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
    if (error instanceof CalendarConfirmationRequestError) {
      json(response, 400, { status: "invalid_request" });
      return;
    }
    if (error instanceof CalendarProposalConfirmationError) {
      if (error.code === "INVALID_REQUEST") {
        json(response, 400, { status: "invalid_request" });
        return;
      }
      if (error.code === "PROPOSAL_UNAVAILABLE") {
        json(response, 404, { status: "not_found" });
        return;
      }
      if (error.code === "CONFIRMATION_CONFLICT") {
        json(response, 409, { status: "confirmation_conflict" });
        return;
      }
      json(response, 409, { status: "proposal_not_confirmable" });
      return;
    }
    json(response, 500, { status: "internal_error" });
  }
}
