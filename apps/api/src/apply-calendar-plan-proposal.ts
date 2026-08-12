import { createHash } from "node:crypto";
import type {
  AppliedProposalRecord,
  ApplyStoredProposalCommand,
  CalendarCategory,
  CalendarCommitment,
  CalendarPlanRecord,
  Clock,
  CommitReceipt,
  DomainEventRecord,
  IdGenerator,
  StoredCalendarProposal,
  WriteRequestContext,
  WriteUnitOfWork,
} from "../../../packages/domain/write-boundary";

export class ProposalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalValidationError";
  }
}

export interface ApplyCalendarPlanDependencies {
  unitOfWork: WriteUnitOfWork;
  clock: Clock;
  ids: IdGenerator;
}

type ValidatedStoredCalendarProposal = StoredCalendarProposal & {
  plan: StoredCalendarProposal["plan"] & { category: CalendarCategory; commitment: CalendarCommitment };
  state: "READY_TO_APPLY";
};

const calendarCategories: readonly CalendarCategory[] = [
  "Work", "Creator", "Learning", "Health", "Family", "Friends", "Travel", "Personal", "Rest",
];
const calendarCommitments: readonly CalendarCommitment[] = ["Fixed", "Important", "Flexible", "Optional"];

function requireText(value: string, label: string) {
  if (!value.trim()) throw new ProposalValidationError(`${label} is required`);
}

function isCalendarCategory(value: unknown): value is CalendarCategory {
  return typeof value === "string" && calendarCategories.includes(value as CalendarCategory);
}

function isCalendarCommitment(value: unknown): value is CalendarCommitment {
  return typeof value === "string" && calendarCommitments.includes(value as CalendarCommitment);
}

function validateRequest(command: ApplyStoredProposalCommand, context: WriteRequestContext) {
  requireText(context.principal.userId, "requestContext.principal.userId");
  requireText(context.requestId, "requestContext.requestId");
  requireText(command.proposalId, "proposalId");

  if (context.principal.actorType !== "USER") {
    throw new ProposalValidationError("This boundary requires an authenticated user principal");
  }
  if (!command.confirmation.explicit) {
    throw new ProposalValidationError("An explicit user Apply/Confirm action is required");
  }
  if (!Number.isFinite(Date.parse(context.receivedAt))) {
    throw new ProposalValidationError("requestContext.receivedAt must be a valid timestamp");
  }
}

function validateStoredProposal(
  proposal: StoredCalendarProposal,
): asserts proposal is ValidatedStoredCalendarProposal {
  requireText(proposal.sourceText, "storedProposal.sourceText");
  requireText(proposal.correlationId, "storedProposal.correlationId");
  requireText(proposal.plan.title, "storedProposal.plan.title");

  if (proposal.destination !== "CALENDAR" || proposal.operation !== "CREATE_CALENDAR_PLAN") {
    throw new ProposalValidationError("Stored proposal is not a supported Calendar create operation");
  }
  if (proposal.state !== "READY_TO_APPLY") {
    throw new ProposalValidationError(`Stored proposal is not ready to apply: ${proposal.state}`);
  }
  if (proposal.approvalMode === "HIGH_AUTHORITY_APPROVAL") {
    throw new ProposalValidationError("High-authority changes require their own dedicated approval flow");
  }
  if (!isCalendarCategory(proposal.plan.category)) {
    throw new ProposalValidationError("Stored Calendar category is unresolved or invalid; clarification is required before apply");
  }
  if (!isCalendarCommitment(proposal.plan.commitment)) {
    throw new ProposalValidationError("Stored Calendar commitment is invalid");
  }

  const startsAt = Date.parse(proposal.plan.startsAt);
  const endsAt = Date.parse(proposal.plan.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
    throw new ProposalValidationError("Stored Calendar start and end must be valid timestamps");
  }
  if (endsAt <= startsAt) {
    throw new ProposalValidationError("Stored Calendar end must be after start");
  }
}

function requestFingerprint(proposal: StoredCalendarProposal, context: WriteRequestContext) {
  const semantics = JSON.stringify({
    authenticatedUserId: context.principal.userId,
    source: context.source,
    proposalId: proposal.proposalId,
    captureId: proposal.captureId,
    destination: proposal.destination,
    operation: proposal.operation,
    sourceText: proposal.sourceText,
    correlationId: proposal.correlationId,
    approvalMode: proposal.approvalMode,
    plan: {
      title: proposal.plan.title.trim(),
      startsAt: proposal.plan.startsAt,
      endsAt: proposal.plan.endsAt,
      category: proposal.plan.category,
      commitment: proposal.plan.commitment,
    },
  });
  return createHash("sha256").update(semantics).digest("hex");
}

function replayReceipt(existing: AppliedProposalRecord): CommitReceipt {
  return {
    proposalId: existing.proposalId,
    entityType: existing.entityType,
    entityId: existing.entityId,
    eventId: existing.eventId,
    appliedAt: existing.appliedAt,
    idempotentReplay: true,
  };
}

export async function applyCalendarPlanProposal(
  command: ApplyStoredProposalCommand,
  context: WriteRequestContext,
  dependencies: ApplyCalendarPlanDependencies,
): Promise<CommitReceipt> {
  validateRequest(command, context);
  const authenticatedUserId = context.principal.userId;

  return dependencies.unitOfWork.run(authenticatedUserId, async (transaction) => {
    const proposal = await transaction.getStoredCalendarProposalForUpdate(command.proposalId, authenticatedUserId);
    if (!proposal) {
      throw new ProposalValidationError("Proposal is unavailable for this authenticated user");
    }

    const existing = await transaction.findAppliedProposal(command.proposalId);
    if (proposal.state === "APPLIED") {
      if (!existing || existing.confirmedByActorId !== authenticatedUserId) {
        throw new Error("Applied proposal integrity mismatch");
      }
      if (proposal.appliedEntityId !== existing.entityId || proposal.appliedEventId !== existing.eventId) {
        throw new Error("Stored proposal receipt does not match applied-proposal marker");
      }
      return replayReceipt(existing);
    }

    if (existing) {
      throw new Error("Applied-proposal marker exists while stored proposal is not APPLIED");
    }

    validateStoredProposal(proposal);
    const fingerprint = requestFingerprint(proposal, context);
    const recordedAt = dependencies.clock.now();
    const entityId = dependencies.ids.next("calendar");
    const eventId = dependencies.ids.next("event");

    const calendarPlan: CalendarPlanRecord = {
      id: entityId,
      userId: authenticatedUserId,
      title: proposal.plan.title.trim(),
      startsAt: proposal.plan.startsAt,
      endsAt: proposal.plan.endsAt,
      category: proposal.plan.category,
      commitment: proposal.plan.commitment,
      createdAt: recordedAt,
      sourceProposalId: proposal.proposalId,
    };

    const event: DomainEventRecord = {
      eventId,
      userId: authenticatedUserId,
      occurredAt: context.receivedAt,
      recordedAt,
      actorType: "USER",
      actorId: authenticatedUserId,
      eventType: "CALENDAR_EVENT_CREATED",
      entityType: "calendar_event",
      entityId,
      source: context.source,
      correlationId: proposal.correlationId,
      payloadJson: {
        proposalId: proposal.proposalId,
        captureId: proposal.captureId,
        title: calendarPlan.title,
        startsAt: calendarPlan.startsAt,
        endsAt: calendarPlan.endsAt,
        category: calendarPlan.category,
        commitment: calendarPlan.commitment,
        confirmationMode: proposal.approvalMode,
      },
      schemaVersion: 1,
    };

    const applied: AppliedProposalRecord = {
      proposalId: proposal.proposalId,
      appliedAt: recordedAt,
      confirmedByActorId: authenticatedUserId,
      requestFingerprint: fingerprint,
      entityType: "calendar_event",
      entityId,
      eventId,
    };

    await transaction.createCalendarPlan(calendarPlan);
    await transaction.appendDomainEvent(event);
    await transaction.markProposalApplied(applied);
    await transaction.markStoredProposalApplied(proposal.proposalId, authenticatedUserId, recordedAt, entityId, eventId);

    return {
      proposalId: proposal.proposalId,
      entityType: "calendar_event",
      entityId,
      eventId,
      appliedAt: recordedAt,
      idempotentReplay: false,
    };
  });
}
