import { createHash } from "node:crypto";
import type {
  DriftOccurrenceReceipt,
  RecordDriftCommand,
} from "../../../packages/contracts/drift-return";
import type {
  DriftClock,
  DriftIdGenerator,
  DriftRequestContext,
  DriftUnitOfWork,
} from "../../../packages/domain/drift-return";
import {
  DriftError,
  normalizedDriftInstant,
  normalizedDriftSourceNote,
  requiredDriftOpaqueId,
  requiredDriftRequestId,
} from "./drift-return-validation";

export interface RecordDriftDependencies {
  unitOfWork: DriftUnitOfWork;
  clock: DriftClock;
  ids: DriftIdGenerator;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function recordDrift(
  command: RecordDriftCommand,
  context: DriftRequestContext,
  dependencies: RecordDriftDependencies,
): Promise<DriftOccurrenceReceipt> {
  const userId = requiredDriftOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const sourceNote = normalizedDriftSourceNote(command.sourceNote);
  const requestId = requiredDriftRequestId(context.requestId, "drift_record");
  const occurredAt = normalizedDriftInstant(context.receivedAt);
  const requestFingerprint = fingerprint({ sourceNote });

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const replay = await transaction.findOccurrenceByRequestId(requestId, userId);
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) throw new DriftError("IDEMPOTENCY_CONFLICT");
      return {
        driftId: replay.driftId,
        lifecycleState: "RECORDED",
        authorityClass: "USER_SOURCE",
        occurredAt: replay.occurredAt,
        recordedAt: replay.recordedAt,
        idempotentReplay: true,
      };
    }

    const recordedAt = normalizedDriftInstant(dependencies.clock.now());
    if (Date.parse(recordedAt) < Date.parse(occurredAt)) throw new DriftError("INVALID_DECISION");
    const driftId = requiredDriftOpaqueId(dependencies.ids.next("drift"), "INVALID_DRIFT");
    const eventId = requiredDriftOpaqueId(dependencies.ids.next("event"), "INVALID_DECISION");

    await transaction.createOccurrence({
      driftId,
      userId,
      ...(sourceNote ? { sourceNote } : {}),
      occurredAt,
      recordedAt,
      correlationId: requestId,
      source: context.source,
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
      eventType: "DRIFT_RECORDED",
      entityType: "drift_occurrence",
      entityId: driftId,
      source: context.source,
      correlationId: requestId,
      payloadJson: {
        lifecycleState: "RECORDED",
        authorityClass: "USER_SOURCE",
        hasSourceNote: sourceNote !== undefined,
      },
      schemaVersion: 1,
    });

    return {
      driftId,
      lifecycleState: "RECORDED",
      authorityClass: "USER_SOURCE",
      occurredAt,
      recordedAt,
      idempotentReplay: false,
    };
  });
}
