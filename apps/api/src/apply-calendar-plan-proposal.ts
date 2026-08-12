import type {
  AppliedProposalRecord,
  ApplyCalendarPlanProposalCommand,
  CalendarPlanRecord,
  Clock,
  CommitReceipt,
  DomainEventRecord,
  IdGenerator,
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

function requireText(value: string, label: string) {
  if (!value.trim()) throw new ProposalValidationError(`${label} is required`);
}

function requestFingerprint(command: ApplyCalendarPlanProposalCommand) {
  return JSON.stringify({
    actorId: command.confirmation.actorId,
    destination: command.destination,
    operation: command.operation,
    sourceText: command.sourceText,
    correlationId: command.correlationId,
    approvalMode: command.approvalMode,
    plan: {
      title: command.plan.title.trim(),
      startsAt: command.plan.startsAt,
      endsAt: command.plan.endsAt,
      category: command.plan.category,
      commitment: command.plan.commitment,
    },
  });
}

function validate(command: ApplyCalendarPlanProposalCommand) {
  requireText(command.proposalId, "proposalId");
  requireText(command.correlationId, "correlationId");
  requireText(command.sourceText, "sourceText");
  requireText(command.confirmation.actorId, "confirmation.actorId");
  requireText(command.plan.title, "plan.title");

  if (command.destination !== "CALENDAR" || command.operation !== "CREATE_CALENDAR_PLAN") {
    throw new ProposalValidationError("This write boundary only accepts CREATE_CALENDAR_PLAN proposals owned by Calendar");
  }

  if (command.confirmation.actorType !== "USER") {
    throw new ProposalValidationError("The authoritative confirmation must come from the user");
  }

  if (!command.confirmation.explicit) {
    throw new ProposalValidationError("An explicit user Apply/Confirm action is required");
  }

  if (command.approvalMode === "HIGH_AUTHORITY_APPROVAL") {
    throw new ProposalValidationError("High-authority changes require their own dedicated approval flow");
  }

  if (command.plan.category === "UNRESOLVED") {
    throw new ProposalValidationError("Calendar category is unresolved; ask for clarification before commit");
  }

  const startsAt = Date.parse(command.plan.startsAt);
  const endsAt = Date.parse(command.plan.endsAt);
  const confirmedAt = Date.parse(command.confirmation.confirmedAt);

  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
    throw new ProposalValidationError("Calendar start and end must be valid timestamps");
  }

  if (endsAt <= startsAt) {
    throw new ProposalValidationError("Calendar end must be after start");
  }

  if (!Number.isFinite(confirmedAt)) {
    throw new ProposalValidationError("confirmation.confirmedAt must be a valid timestamp");
  }
}

export async function applyCalendarPlanProposal(
  command: ApplyCalendarPlanProposalCommand,
  dependencies: ApplyCalendarPlanDependencies,
): Promise<CommitReceipt> {
  validate(command);
  const fingerprint = requestFingerprint(command);

  return dependencies.unitOfWork.run(async (transaction) => {
    const existing = await transaction.findAppliedProposal(command.proposalId);
    if (existing) {
      if (existing.confirmedByActorId !== command.confirmation.actorId) {
        throw new ProposalValidationError("This proposal id was already applied by a different user");
      }
      if (existing.requestFingerprint !== fingerprint) {
        throw new ProposalValidationError("This proposal id was already applied with different content");
      }

      return {
        proposalId: existing.proposalId,
        entityType: existing.entityType,
        entityId: existing.entityId,
        eventId: existing.eventId,
        appliedAt: existing.appliedAt,
        idempotentReplay: true,
      };
    }

    const recordedAt = dependencies.clock.now();
    const entityId = dependencies.ids.next("calendar");
    const eventId = dependencies.ids.next("event");

    const calendarPlan: CalendarPlanRecord = {
      id: entityId,
      userId: command.confirmation.actorId,
      title: command.plan.title.trim(),
      startsAt: command.plan.startsAt,
      endsAt: command.plan.endsAt,
      category: command.plan.category,
      commitment: command.plan.commitment,
      createdAt: recordedAt,
      sourceProposalId: command.proposalId,
    };

    const event: DomainEventRecord = {
      eventId,
      userId: command.confirmation.actorId,
      occurredAt: command.confirmation.confirmedAt,
      recordedAt,
      actorType: "USER",
      actorId: command.confirmation.actorId,
      eventType: "CALENDAR_EVENT_CREATED",
      entityType: "calendar_event",
      entityId,
      source: command.source,
      correlationId: command.correlationId,
      payloadJson: {
        proposalId: command.proposalId,
        sourceText: command.sourceText,
        title: calendarPlan.title,
        startsAt: calendarPlan.startsAt,
        endsAt: calendarPlan.endsAt,
        category: calendarPlan.category,
        commitment: calendarPlan.commitment,
        confirmationMode: command.approvalMode,
      },
      schemaVersion: 1,
    };

    const applied: AppliedProposalRecord = {
      proposalId: command.proposalId,
      appliedAt: recordedAt,
      confirmedByActorId: command.confirmation.actorId,
      requestFingerprint: fingerprint,
      entityType: "calendar_event",
      entityId,
      eventId,
    };

    await transaction.createCalendarPlan(calendarPlan);
    await transaction.appendDomainEvent(event);
    await transaction.markProposalApplied(applied);

    return {
      proposalId: command.proposalId,
      entityType: "calendar_event",
      entityId,
      eventId,
      appliedAt: recordedAt,
      idempotentReplay: false,
    };
  });
}
