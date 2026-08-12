import { createHash } from "node:crypto";
import type {
  AppliedProposalRecord,
  ApplyCalendarPlanProposalCommand,
  CalendarCategory,
  CalendarPlanRecord,
  Clock,
  CommitReceipt,
  DomainEventRecord,
  IdGenerator,
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

type ValidatedCalendarCommand = ApplyCalendarPlanProposalCommand & {
  plan: ApplyCalendarPlanProposalCommand["plan"] & { category: CalendarCategory };
};

function requireText(value: string, label: string) {
  if (!value.trim()) throw new ProposalValidationError(`${label} is required`);
}

function requestFingerprint(command: ApplyCalendarPlanProposalCommand, context: WriteRequestContext) {
  const semantics = JSON.stringify({
    authenticatedUserId: context.principal.userId,
    source: context.source,
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

  return createHash("sha256").update(semantics).digest("hex");
}

function validate(
  command: ApplyCalendarPlanProposalCommand,
  context: WriteRequestContext,
): asserts command is ValidatedCalendarCommand {
  requireText(context.principal.userId, "requestContext.principal.userId");
  requireText(context.requestId, "requestContext.requestId");
  requireText(command.proposalId, "proposalId");
  requireText(command.correlationId, "correlationId");
  requireText(command.sourceText, "sourceText");
  requireText(command.plan.title, "plan.title");

  if (context.principal.actorType !== "USER") {
    throw new ProposalValidationError("This boundary requires an authenticated user principal");
  }

  if (command.destination !== "CALENDAR" || command.operation !== "CREATE_CALENDAR_PLAN") {
    throw new ProposalValidationError("This write boundary only accepts CREATE_CALENDAR_PLAN proposals owned by Calendar");
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
  const receivedAt = Date.parse(context.receivedAt);

  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
    throw new ProposalValidationError("Calendar start and end must be valid timestamps");
  }

  if (endsAt <= startsAt) {
    throw new ProposalValidationError("Calendar end must be after start");
  }

  if (!Number.isFinite(receivedAt)) {
    throw new ProposalValidationError("requestContext.receivedAt must be a valid timestamp");
  }
}

export async function applyCalendarPlanProposal(
  command: ApplyCalendarPlanProposalCommand,
  context: WriteRequestContext,
  dependencies: ApplyCalendarPlanDependencies,
): Promise<CommitReceipt> {
  validate(command, context);
  const authenticatedUserId = context.principal.userId;
  const fingerprint = requestFingerprint(command, context);

  return dependencies.unitOfWork.run(async (transaction) => {
    const existing = await transaction.findAppliedProposal(command.proposalId);
    if (existing) {
      if (existing.confirmedByActorId !== authenticatedUserId) {
        throw new ProposalValidationError("This proposal id was already applied by a different authenticated user");
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
      userId: authenticatedUserId,
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
      userId: authenticatedUserId,
      occurredAt: context.receivedAt,
      recordedAt,
      actorType: "USER",
      actorId: authenticatedUserId,
      eventType: "CALENDAR_EVENT_CREATED",
      entityType: "calendar_event",
      entityId,
      source: context.source,
      correlationId: command.correlationId,
      payloadJson: {
        proposalId: command.proposalId,
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
      confirmedByActorId: authenticatedUserId,
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
