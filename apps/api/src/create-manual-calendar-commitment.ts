import type {
  CreateManualCalendarCommitmentCommand,
  ManualCalendarCommitmentReceipt,
  ManualCalendarCategory,
  ManualCalendarCommitment,
} from "../../../packages/contracts/manual-calendar";
import type {
  ManualCalendarClock,
  ManualCalendarIdGenerator,
  ManualCalendarRecord,
  ManualCalendarUnitOfWork,
  ManualCalendarWriteContext,
} from "../../../packages/domain/manual-calendar";
import type { DomainEventRecord } from "../../../packages/domain/write-boundary";

const categories: readonly ManualCalendarCategory[] = [
  "Work", "Creator", "Learning", "Health", "Family", "Friends", "Travel", "Personal", "Rest",
];
const commitments: readonly ManualCalendarCommitment[] = ["Fixed", "Important", "Flexible", "Optional"];

export type ManualCalendarErrorCode =
  | "INVALID_COMMAND"
  | "CONFIRMATION_REQUIRED"
  | "IDEMPOTENCY_CONFLICT";

export class ManualCalendarError extends Error {
  constructor(readonly code: ManualCalendarErrorCode, message: string) {
    super(message);
    this.name = "ManualCalendarError";
  }
}

export interface CreateManualCalendarDependencies {
  unitOfWork: ManualCalendarUnitOfWork;
  clock: ManualCalendarClock;
  ids: ManualCalendarIdGenerator;
}

function isCategory(value: unknown): value is ManualCalendarCategory {
  return typeof value === "string" && categories.includes(value as ManualCalendarCategory);
}

function isCommitment(value: unknown): value is ManualCalendarCommitment {
  return typeof value === "string" && commitments.includes(value as ManualCalendarCommitment);
}

function normalize(command: CreateManualCalendarCommitmentCommand) {
  const title = command.title.trim();
  if (!title || title.length > 500) throw new ManualCalendarError("INVALID_COMMAND", "Calendar title is invalid");
  if (!isCategory(command.category) || !isCommitment(command.commitment)) {
    throw new ManualCalendarError("INVALID_COMMAND", "Calendar category or commitment is invalid");
  }
  if (command.confirmation.explicit !== true || command.confirmation.acknowledgement !== "COMMIT_TO_CALENDAR") {
    throw new ManualCalendarError("CONFIRMATION_REQUIRED", "Explicit Calendar confirmation is required");
  }

  const starts = Date.parse(command.startsAt);
  const ends = Date.parse(command.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) {
    throw new ManualCalendarError("INVALID_COMMAND", "Calendar start/end are invalid");
  }

  return {
    title,
    startsAt: new Date(starts).toISOString(),
    endsAt: new Date(ends).toISOString(),
    category: command.category,
    commitment: command.commitment,
  };
}

function same(existing: ManualCalendarRecord, desired: ReturnType<typeof normalize>) {
  return existing.title === desired.title
    && existing.startsAt === desired.startsAt
    && existing.endsAt === desired.endsAt
    && existing.category === desired.category
    && existing.commitment === desired.commitment;
}

function receipt(record: ManualCalendarRecord, status: "created" | "replayed"): ManualCalendarCommitmentReceipt {
  return {
    status,
    item: {
      id: record.id,
      title: record.title,
      startsAt: record.startsAt,
      endsAt: record.endsAt,
      category: record.category,
      commitment: record.commitment,
      authorityClass: "FACT",
      committedAt: record.createdAt,
    },
  };
}

export async function createManualCalendarCommitment(
  command: CreateManualCalendarCommitmentCommand,
  context: ManualCalendarWriteContext,
  dependencies: CreateManualCalendarDependencies,
): Promise<ManualCalendarCommitmentReceipt> {
  if (context.principal.actorType !== "USER" || !context.principal.userId.trim() || !context.requestId.trim()) {
    throw new ManualCalendarError("INVALID_COMMAND", "A trusted user write context is required");
  }
  const desired = normalize(command);
  const userId = context.principal.userId;
  const sourceKey = `manual:${context.requestId}`;

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const existing = await transaction.findBySourceKey(sourceKey, userId);
    if (existing) {
      if (!same(existing, desired)) {
        throw new ManualCalendarError("IDEMPOTENCY_CONFLICT", "The idempotency key belongs to a different Calendar commitment");
      }
      return receipt(existing, "replayed");
    }

    const recordedAt = dependencies.clock.now();
    const record: ManualCalendarRecord = {
      id: dependencies.ids.next("calendar"),
      userId,
      ...desired,
      createdAt: recordedAt,
      sourceKey,
    };
    const event: DomainEventRecord = {
      eventId: dependencies.ids.next("event"),
      userId,
      occurredAt: context.receivedAt,
      recordedAt,
      actorType: "USER",
      actorId: userId,
      eventType: "CALENDAR_EVENT_CREATED",
      entityType: "calendar_event",
      entityId: record.id,
      source: "WEB_APP",
      correlationId: context.requestId,
      payloadJson: {
        origin: "USER_MANUAL",
        title: record.title,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        category: record.category,
        commitment: record.commitment,
        confirmation: "COMMIT_TO_CALENDAR",
      },
      schemaVersion: 1,
    };

    await transaction.create(record);
    await transaction.appendDomainEvent(event);
    return receipt(record, "created");
  });
}
