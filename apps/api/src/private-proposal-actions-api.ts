import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type { Clock, IdGenerator, WriteUnitOfWork } from "../../../packages/domain/write-boundary";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import {
  applyCalendarPlanProposal,
  ProposalValidationError,
} from "./apply-calendar-plan-proposal";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import {
  ProposalRejectionError,
  rejectRoutingProposal,
} from "./reject-routing-proposal";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";

const MAX_BODY_BYTES = 4 * 1024;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export interface PrivateProposalActionsApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  unitOfWork: WriteUnitOfWork;
  mutationClock: Clock;
  applyIds: IdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

type ProposalActionRoute =
  | { kind: "APPLY"; proposalId: string }
  | { kind: "REJECT"; proposalId: string };

type RequestFailureKind = "UNSUPPORTED_MEDIA_TYPE" | "REQUEST_TOO_LARGE" | "INVALID_REQUEST";

class ProposalActionRequestError extends Error {
  constructor(readonly kind: RequestFailureKind) {
    super(kind);
    this.name = "ProposalActionRequestError";
  }
}

function json(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("pragma", "no-cache");
  response.setHeader("vary", "Authorization");
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

function decodedOpaqueId(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value);
    return opaqueIdPattern.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function routeOf(request: IncomingMessage): ProposalActionRoute | undefined {
  const match = /^\/api\/v1\/proposals\/([^/]+)\/(apply|reject)$/.exec(pathOf(request));
  if (!match) return undefined;
  const proposalId = decodedOpaqueId(match[1]);
  if (!proposalId) return undefined;
  return match[2] === "apply" ? { kind: "APPLY", proposalId } : { kind: "REJECT", proposalId };
}

function bearerCredential(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.length > 4096) return undefined;
  return /^Bearer ([^\s,]+)$/.exec(header)?.[1];
}

function requireJsonContentType(request: IncomingMessage) {
  const encoding = request.headers["content-encoding"];
  if (encoding !== undefined && encoding !== "identity") {
    throw new ProposalActionRequestError("UNSUPPORTED_MEDIA_TYPE");
  }
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string") throw new ProposalActionRequestError("UNSUPPORTED_MEDIA_TYPE");
  if (contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new ProposalActionRequestError("UNSUPPORTED_MEDIA_TYPE");
  }
}

async function readJsonObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new ProposalActionRequestError("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ProposalActionRequestError("INVALID_REQUEST");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProposalActionRequestError("INVALID_REQUEST");
  }
  return parsed as Record<string, unknown>;
}

function readApplyCommand(body: Record<string, unknown>) {
  if (Object.keys(body).length !== 1 || !("confirmation" in body)) {
    throw new ProposalActionRequestError("INVALID_REQUEST");
  }
  const confirmation = body.confirmation;
  if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) {
    throw new ProposalActionRequestError("INVALID_REQUEST");
  }
  const record = confirmation as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || record.explicit !== true) {
    throw new ProposalActionRequestError("INVALID_REQUEST");
  }
  return { confirmation: { explicit: true } as const };
}

function readRejectCommand(body: Record<string, unknown>) {
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "reason") || keys.length > 1) {
    throw new ProposalActionRequestError("INVALID_REQUEST");
  }
  if (!("reason" in body)) return {};
  if (typeof body.reason !== "string") throw new ProposalActionRequestError("INVALID_REQUEST");
  return { reason: body.reason };
}

function isUnavailable(error: unknown) {
  return (error instanceof ProposalValidationError || error instanceof ProposalRejectionError)
    && error.message === "Proposal is unavailable for this authenticated user";
}

function isRejectInputError(error: unknown) {
  return error instanceof ProposalRejectionError
    && (error.message === "reason must contain text when provided" || error.message === "reason must be 1000 characters or fewer");
}

function mapSharedFailure(error: unknown, response: ServerResponse): boolean {
  if (error instanceof AuthenticationRequiredError) {
    json(response, 401, { status: "authentication_required" });
    return true;
  }
  if (error instanceof AuthenticationUnavailableError) {
    json(response, 503, { status: "authentication_unavailable" });
    return true;
  }
  if (error instanceof ProposalActionRequestError) {
    if (error.kind === "UNSUPPORTED_MEDIA_TYPE") {
      json(response, 415, { status: "unsupported_media_type" });
      return true;
    }
    if (error.kind === "REQUEST_TOO_LARGE") {
      json(response, 413, { status: "request_too_large" });
      return true;
    }
    json(response, 400, { status: "invalid_request" });
    return true;
  }
  if (isUnavailable(error)) {
    json(response, 404, { status: "not_found" });
    return true;
  }
  return false;
}

export async function handlePrivateProposalActionRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateProposalActionsApiDependencies,
): Promise<void> {
  const route = routeOf(request);
  if (!route) {
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
    const body = await readJsonObject(request);

    if (route.kind === "APPLY") {
      const command = readApplyCommand(body);
      const receipt = await runInstrumentedOperation({
        operation: "APPLY_CALENDAR_PROPOSAL",
        runtime: dependencies.runtime,
        telemetry: dependencies.telemetry,
        timer: dependencies.operationTimer,
        initialTrace: { requestId: context.requestId, proposalId: route.proposalId },
        async work() {
          const value = await applyCalendarPlanProposal(
            { proposalId: route.proposalId, confirmation: command.confirmation },
            context,
            { unitOfWork: dependencies.unitOfWork, clock: dependencies.mutationClock, ids: dependencies.applyIds },
          );
          return { value, trace: { proposalId: value.proposalId, eventId: value.eventId } };
        },
        classifyFailure(error) {
          if (isUnavailable(error)) return { outcome: "UNAVAILABLE", errorCode: "PROPOSAL_APPLY_UNAVAILABLE" };
          if (error instanceof ProposalValidationError) return { outcome: "REJECTED", errorCode: "PROPOSAL_APPLY_NOT_APPLICABLE" };
          return { outcome: "FAILED", errorCode: "PROPOSAL_APPLY_FAILED" };
        },
      });

      json(response, 200, {
        status: receipt.idempotentReplay ? "replayed" : "applied",
        proposalId: receipt.proposalId,
        entityType: receipt.entityType,
        entityId: receipt.entityId,
        eventId: receipt.eventId,
        appliedAt: receipt.appliedAt,
      });
      return;
    }

    const command = readRejectCommand(body);
    const receipt = await runInstrumentedOperation({
      operation: "REJECT_ROUTING_PROPOSAL",
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId, proposalId: route.proposalId },
      async work() {
        const value = await rejectRoutingProposal(
          { proposalId: route.proposalId, reason: command.reason },
          context,
          { unitOfWork: dependencies.unitOfWork, clock: dependencies.mutationClock },
        );
        return { value, trace: { proposalId: value.proposalId } };
      },
      classifyFailure(error) {
        if (isUnavailable(error)) return { outcome: "UNAVAILABLE", errorCode: "PROPOSAL_REJECT_UNAVAILABLE" };
        if (error instanceof ProposalRejectionError) return { outcome: "REJECTED", errorCode: "PROPOSAL_REJECT_CONFLICT" };
        return { outcome: "FAILED", errorCode: "PROPOSAL_REJECT_FAILED" };
      },
    });

    json(response, 200, {
      status: receipt.idempotentReplay ? "replayed" : "rejected",
      proposalId: receipt.proposalId,
      rejectedAt: receipt.rejectedAt,
      recordedAt: receipt.recordedAt,
    });
  } catch (error) {
    if (mapSharedFailure(error, response)) return;
    if (error instanceof ProposalValidationError) {
      json(response, 409, { status: "proposal_not_applicable" });
      return;
    }
    if (isRejectInputError(error)) {
      json(response, 400, { status: "invalid_request" });
      return;
    }
    if (error instanceof ProposalRejectionError) {
      json(response, 409, { status: "rejection_conflict" });
      return;
    }
    json(response, 500, { status: "internal_error" });
  }
}

export function createLifeOsPrivateProposalActionsServer(dependencies: PrivateProposalActionsApiDependencies): Server {
  return createServer((request, response) => {
    void handlePrivateProposalActionRequest(request, response, dependencies);
  });
}
