import { createHash } from "node:crypto";
import type {
  AppendDailyLogEntryCommand,
  DailyLogEntryReceipt,
} from "../../../packages/contracts/daily-return";
import type {
  DailyReturnClock,
  DailyReturnIdGenerator,
  DailyReturnRequestContext,
  DailyReturnUnitOfWork,
} from "../../../packages/domain/daily-return";
import {
  DailyReturnError,
  normalizedInstant,
  normalizedLocalDate,
  normalizedReflection,
  normalizedTimeZone,
  requiredDailyReturnRequestId,
  requiredOpaqueId,
} from "./daily-return-validation";

export interface AppendDailyLogEntryDependencies {
  unitOfWork: DailyReturnUnitOfWork;
  clock: DailyReturnClock;
  ids: DailyReturnIdGenerator;
}

function fingerprint(command: AppendDailyLogEntryCommand): string {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

export async function appendDailyLogEntry(
  command: AppendDailyLogEntryCommand,
  context: DailyReturnRequestContext,
  dependencies: AppendDailyLogEntryDependencies,
): Promise<DailyLogEntryReceipt> {
  const userId = requiredOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const requestId = requiredDailyReturnRequestId(context.requestId, "daily_log_append");
  const normalized = {
    localDate: normalizedLocalDate(command.localDate),
    timeZone: normalizedTimeZone(command.timeZone),
    body: normalizedReflection(command.body, "INVALID_ENTRY"),
  };
  const occurredAt = normalizedInstant(context.receivedAt, "INVALID_ENTRY");
  const requestFingerprint = fingerprint(normalized);

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const existing = await transaction.findLogEntryByRequestId(requestId, userId);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new DailyReturnError("IDEMPOTENCY_CONFLICT");
      }
      return {
        entryId: existing.entryId,
        localDate: existing.localDate,
        authorityClass: "REFLECTION",
        occurredAt: existing.occurredAt,
        recordedAt: existing.recordedAt,
        idempotentReplay: true,
      };
    }

    const recordedAt = normalizedInstant(dependencies.clock.now(), "INVALID_ENTRY");
    if (Date.parse(recordedAt) < Date.parse(occurredAt)) {
      throw new DailyReturnError("INVALID_ENTRY");
    }

    const entryId = requiredOpaqueId(dependencies.ids.next("daily-log"), "INVALID_ENTRY");
    const eventId = requiredOpaqueId(dependencies.ids.next("event"), "INVALID_ENTRY");

    await transaction.createLogEntry({
      entryId,
      userId,
      ...normalized,
      occurredAt,
      recordedAt,
      requestId,
      requestFingerprint,
    });
    await transaction.appendDomainEvent({
      eventId,
      userId,
      occurredAt,
      recordedAt,
      actorType: "USER",
      actorId: userId,
      eventType: "DAILY_LOG_ENTRY_RECORDED",
      entityType: "daily_log_entry",
      entityId: entryId,
      source: context.source,
      correlationId: requestId,
      payloadJson: {
        authorityClass: "REFLECTION",
        localDate: normalized.localDate,
        timeZone: normalized.timeZone,
        body: normalized.body,
      },
      schemaVersion: 1,
    });

    return {
      entryId,
      localDate: normalized.localDate,
      authorityClass: "REFLECTION",
      occurredAt,
      recordedAt,
      idempotentReplay: false,
    };
  });
}
