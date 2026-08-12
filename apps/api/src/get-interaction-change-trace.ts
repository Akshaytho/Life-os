import type {
  InteractionCanonicalChange,
  InteractionChangeTrace,
  InteractionProposalTrace,
  InteractionTraceStatus,
} from "../../../packages/contracts/interaction-change-ledger";
import type { InteractionChangeLedgerReader } from "../../../packages/domain/interaction-change-ledger";
import type { DomainEventRecord } from "../../../packages/domain/write-boundary";

export class InteractionChangeTraceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InteractionChangeTraceError";
  }
}

export interface InteractionTracePrincipal {
  actorType: "USER";
  userId: string;
}

export interface GetInteractionChangeTraceDependencies {
  reader: InteractionChangeLedgerReader;
}

function requireText(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new InteractionChangeTraceError(`${label} is required`);
}

function statusFor(proposals: InteractionProposalTrace[], hasInterpretation: boolean): InteractionTraceStatus {
  if (!hasInterpretation) return "AWAITING_INTERPRETATION";
  if (proposals.length === 0) return "AWAITING_REVIEW";

  const states = proposals.map((item) => item.state);
  if (states.every((state) => state === "REJECTED")) return "CLOSED_NO_CHANGE";
  if (states.every((state) => state === "APPLIED")) return "COMMITTED";
  if (states.some((state) => state === "APPLIED")) return "PARTIALLY_COMMITTED";
  if (states.some((state) => state === "NEEDS_CONFIRMATION")) return "NEEDS_USER";
  if (states.some((state) => state === "READY_TO_APPLY")) return "READY_FOR_APPROVAL";
  return "AWAITING_REVIEW";
}

function stringDetail(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function projectCalendarEvent(event: DomainEventRecord, resultClass: InteractionProposalTrace["proposedResultClass"]): InteractionCanonicalChange {
  const title = stringDetail(event.payloadJson, "title");
  const startsAt = stringDetail(event.payloadJson, "startsAt");
  const endsAt = stringDetail(event.payloadJson, "endsAt");
  const category = stringDetail(event.payloadJson, "category");
  const commitment = stringDetail(event.payloadJson, "commitment");

  const details: Record<string, string> = {};
  if (title) details.title = title;
  if (startsAt) details.startsAt = startsAt;
  if (endsAt) details.endsAt = endsAt;
  if (category) details.category = category;
  if (commitment) details.commitment = commitment;

  return {
    resultClass,
    eventId: event.eventId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorType: event.actorType,
    actorId: event.actorId,
    source: event.source,
    occurredAt: event.occurredAt,
    recordedAt: event.recordedAt,
    summary: title ? `Calendar event created: ${title}` : "Calendar event created",
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

export async function getInteractionChangeTrace(
  captureId: string,
  principal: InteractionTracePrincipal,
  dependencies: GetInteractionChangeTraceDependencies,
): Promise<InteractionChangeTrace | undefined> {
  requireText(captureId, "captureId");
  requireText(principal.userId, "principal.userId");
  if (principal.actorType !== "USER") throw new InteractionChangeTraceError("Interaction trace requires an authenticated user principal");

  const persisted = await dependencies.reader.getTrace(captureId, principal.userId);
  if (!persisted) return undefined;
  if (persisted.capture.userId !== principal.userId) {
    throw new InteractionChangeTraceError("Reader returned Capture outside the authenticated user scope");
  }

  const interpretation = persisted.interpretation
    ? {
        authorityClass: "OBSERVATION" as const,
        actorType: persisted.interpretation.interpreter === "LIFE_OS_AI" ? "LIFE_OS_AI" as const : "LIFE_OS" as const,
        interpreter: persisted.interpretation.interpreter,
        intent: persisted.interpretation.intent,
        certainty: persisted.interpretation.certainty,
        confidence: persisted.interpretation.confidence,
        observations: persisted.interpretation.observations.map((item) => ({ ...item })),
        clarification: persisted.interpretation.clarification,
        createdAt: persisted.interpretation.createdAt,
      }
    : undefined;

  const proposals: InteractionProposalTrace[] = persisted.proposals.map(({ proposal, applied, rejection, event }) => {
    if (proposal.userId !== principal.userId || proposal.captureId !== persisted.capture.captureId) {
      throw new InteractionChangeTraceError(`Proposal ${proposal.proposalId} is outside Capture ownership`);
    }

    if (proposal.state === "APPLIED") {
      if (!applied || !event || rejection) {
        throw new InteractionChangeTraceError(`Applied proposal ${proposal.proposalId} is missing or contradicts commit provenance`);
      }
      if (applied.proposalId !== proposal.proposalId || applied.confirmedByActorId !== principal.userId) {
        throw new InteractionChangeTraceError(`Applied proposal ${proposal.proposalId} has invalid user provenance`);
      }
      if (applied.eventId !== event.eventId || event.userId !== principal.userId) {
        throw new InteractionChangeTraceError(`Applied proposal ${proposal.proposalId} has invalid event provenance`);
      }
      if (event.correlationId !== persisted.capture.correlationId) {
        throw new InteractionChangeTraceError(`Event ${event.eventId} does not belong to the Capture correlation chain`);
      }
    } else if (proposal.state === "REJECTED") {
      if (!rejection || applied || event) {
        throw new InteractionChangeTraceError(`Rejected proposal ${proposal.proposalId} is missing or contradicts rejection provenance`);
      }
      if (
        rejection.proposalId !== proposal.proposalId ||
        rejection.userId !== principal.userId ||
        rejection.rejectedByActorId !== principal.userId
      ) {
        throw new InteractionChangeTraceError(`Rejected proposal ${proposal.proposalId} has invalid user provenance`);
      }
    } else if (applied || rejection || event) {
      throw new InteractionChangeTraceError(`Open proposal ${proposal.proposalId} unexpectedly has terminal provenance`);
    }

    const item: InteractionProposalTrace = {
      proposalId: proposal.proposalId,
      authorityClass: "SUGGESTION",
      proposedResultClass: proposal.targetTrustClass,
      destination: proposal.destination,
      operation: proposal.operation,
      approvalMode: proposal.approvalMode,
      state: proposal.state,
      summary: proposal.summary,
      reason: proposal.reason,
      createdAt: proposal.createdAt,
    };

    if (applied && event) {
      item.userAction = {
        authorityClass: "DECISION",
        action: "APPROVED",
        actorType: "USER",
        actorId: applied.confirmedByActorId,
        at: event.occurredAt,
        recordedAt: applied.appliedAt,
      };

      if (event.eventType === "CALENDAR_EVENT_CREATED" && event.entityType === "calendar_event") {
        item.canonicalChange = projectCalendarEvent(event, proposal.targetTrustClass);
      } else {
        throw new InteractionChangeTraceError(`Unsupported V1 canonical event ${event.eventType}/${event.entityType}`);
      }
    }

    if (rejection) {
      item.userAction = {
        authorityClass: "DECISION",
        action: "REJECTED",
        actorType: "USER",
        actorId: rejection.rejectedByActorId,
        at: rejection.rejectedAt,
        recordedAt: rejection.recordedAt,
        reason: rejection.reason,
      };
    }

    return item;
  });

  return {
    captureId: persisted.capture.captureId,
    correlationId: persisted.capture.correlationId,
    status: statusFor(proposals, Boolean(interpretation)),
    source: {
      authorityClass: "USER_SOURCE",
      actorType: "USER",
      text: persisted.capture.rawText,
      occurredAt: persisted.capture.receivedAt,
      recordedAt: persisted.capture.recordedAt,
      source: persisted.capture.source,
    },
    interpretation,
    proposals,
    // V1 deliberately refuses to infer projection changes from today's current screen state.
    // A later projection-impact store can populate this only when causation is persisted.
    projectionEffects: {
      status: "NOT_RECORDED_YET",
      items: [],
    },
  };
}
