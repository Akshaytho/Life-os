import type { IncomingMessage, ServerResponse } from "node:http";
import type { CreateManualCalendarCommitmentCommand } from "../../../packages/contracts/manual-calendar";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type {
  ManualCalendarClock,
  ManualCalendarIdGenerator,
  ManualCalendarUnitOfWork,
} from "../../../packages/domain/manual-calendar";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import {
  createManualCalendarCommitment,
  ManualCalendarError,
} from "./create-manual-calendar-commitment";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import { appendVaryHeader } from "./private-cors";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";
import {
  WebWriteIdempotencyError,
  withWebWriteIdempotency,
} from "./web-write-idempotency";

const MAX_BODY_BYTES = 12 * 1024;

export interface PrivateManualCalendarApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  manualCalendarUnitOfWork?: ManualCalendarUnitOfWork;
  manualCalendarClock?: ManualCalendarClock;
  manualCalendarIds?: ManualCalendarIdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class ManualCalendarRequestError extends Error {}

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
  if (encoding !== undefined && encoding !== "identity") throw new ManualCalendarRequestError();
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new ManualCalendarRequestError();
  }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new ManualCalendarRequestError();
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new ManualCalendarRequestError();
  }
}

function commandFromBody(body: Record<string, unknown>): CreateManualCalendarCommitmentCommand {
  const expectedKeys = ["category", "commitment", "confirmation", "endsAt", "startsAt", "title"].sort();
  const actualKeys = Object.keys(body).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new ManualCalendarRequestError();
  }
  const confirmation = body.confirmation;
  if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) throw new ManualCalendarRequestError();
  const confirmationRecord = confirmation as Record<string, unknown>;
  const expectedConfirmationKeys = ["acknowledgement", "explicit"].sort();
  const actualConfirmationKeys = Object.keys(confirmationRecord).sort();
  if (
    actualConfirmationKeys.length !== expectedConfirmationKeys.length
    || actualConfirmationKeys.some((key, index) => key !== expectedConfirmationKeys[index])
  ) throw new ManualCalendarRequestError();

  if (
    typeof body.title !== "string"
    || typeof body.startsAt !== "string"
    || typeof body.endsAt !== "string"
    || typeof body.category !== "string"
    || typeof body.commitment !== "string"
    || typeof confirmationRecord.explicit !== "boolean"
    || typeof confirmationRecord.acknowledgement !== "string"
  ) throw new ManualCalendarRequestError();

  return {
    title: body.title,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    category: body.category as CreateManualCalendarCommitmentCommand["category"],
    commitment: body.commitment as CreateManualCalendarCommitmentCommand["commitment"],
    confirmation: {
      explicit: confirmationRecord.explicit,
      acknowledgement: confirmationRecord.acknowledgement as "COMMIT_TO_CALENDAR",
    },
  };
}

export async function handlePrivateManualCalendarRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateManualCalendarApiDependencies,
): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
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

    const unitOfWork = dependencies.manualCalendarUnitOfWork;
    const clock = dependencies.manualCalendarClock;
    const ids = dependencies.manualCalendarIds;
    if (!unitOfWork || !clock || !ids) {
      json(response, 503, { status: "manual_calendar_unavailable" });
      return;
    }

    requireJsonContentType(request);
    const command = commandFromBody(await readBody(request));
    const context = withWebWriteIdempotency(
      transportContext,
      "CALENDAR_MANUAL_CREATE",
      idempotencyKey(request),
    );

    const receipt = await runInstrumentedOperation({
      operation: "CREATE_MANUAL_CALENDAR_COMMITMENT",
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId },
      async work() {
        const value = await createManualCalendarCommitment(command, context, { unitOfWork, clock, ids });
        return { value };
      },
      classifyFailure(error) {
        if (error instanceof ManualCalendarError) {
          return { outcome: "REJECTED", errorCode: error.code };
        }
        return { outcome: "FAILED", errorCode: "MANUAL_CALENDAR_CREATE_FAILED" };
      },
    });

    json(response, receipt.status === "created" ? 201 : 200, receipt);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      json(response, 401, { status: "authentication_required" });
      return;
    }
    if (error instanceof AuthenticationUnavailableError) {
      json(response, 503, { status: "authentication_unavailable" });
      return;
    }
    if (error instanceof ManualCalendarRequestError) {
      json(response, 400, { status: "invalid_request" });
      return;
    }
    if (error instanceof WebWriteIdempotencyError) {
      json(response, 400, { status: "idempotency_required" });
      return;
    }
    if (error instanceof ManualCalendarError) {
      if (error.code === "CONFIRMATION_REQUIRED") {
        json(response, 409, { status: "explicit_confirmation_required" });
        return;
      }
      if (error.code === "IDEMPOTENCY_CONFLICT") {
        json(response, 409, { status: "idempotency_conflict" });
        return;
      }
      json(response, 400, { status: "invalid_calendar_commitment" });
      return;
    }
    json(response, 500, { status: "internal_error" });
  }
}
