import { createHash } from "node:crypto";
import type {
  BrainDumpClassificationReceipt,
  ConfirmBrainDumpClassificationCommand,
} from "../../../packages/contracts/brain-dump-not-now";
import type {
  BrainDumpNotNowClock,
  BrainDumpNotNowIdGenerator,
  BrainDumpNotNowRequestContext,
  BrainDumpNotNowUnitOfWork,
} from "../../../packages/domain/brain-dump-not-now";
import {
  BrainDumpNotNowError,
  normalizedBrainDumpCategory,
  normalizedBrainDumpInstant,
  requiredBrainDumpOpaqueId,
  requiredBrainDumpRequestId,
} from "./brain-dump-not-now-validation";

export interface ConfirmBrainDumpClassificationDependencies {
  unitOfWork: BrainDumpNotNowUnitOfWork;
  clock: BrainDumpNotNowClock;
  ids: BrainDumpNotNowIdGenerator;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function confirmBrainDumpClassification(
  captureIdInput: string,
  command: ConfirmBrainDumpClassificationCommand,
  context: BrainDumpNotNowRequestContext,
  dependencies: ConfirmBrainDumpClassificationDependencies,
): Promise<BrainDumpClassificationReceipt> {
  const userId = requiredBrainDumpOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const captureId = requiredBrainDumpOpaqueId(captureIdInput, "INVALID_CAPTURE");
  const requestId = requiredBrainDumpRequestId(context.requestId, "brain_dump_classify");
  const category = normalizedBrainDumpCategory(command.category);
  const expectedCurrentClassificationId = command.expectedCurrentClassificationId === null
    ? null
    : requiredBrainDumpOpaqueId(command.expectedCurrentClassificationId, "INVALID_CLASSIFICATION");
  const confirmedAt = normalizedBrainDumpInstant(context.receivedAt, "INVALID_CLASSIFICATION");
  const requestFingerprint = fingerprint({ captureId, category, expectedCurrentClassificationId });

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const capture = await transaction.getCaptureForUpdate(captureId, userId);
    if (!capture) throw new BrainDumpNotNowError("CAPTURE_NOT_FOUND");

    const replay = await transaction.findClassificationByRequestId(requestId, userId);
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) {
        throw new BrainDumpNotNowError("IDEMPOTENCY_CONFLICT");
      }
      return {
        classificationId: replay.classificationId,
        captureId: replay.captureId,
        category: replay.category,
        status: "CURRENT",
        authorityClass: "DECISION",
        confirmedAt: replay.confirmedAt,
        recordedAt: replay.recordedAt,
        ...(replay.supersedesClassificationId
          ? { supersededClassificationId: replay.supersedesClassificationId }
          : {}),
        idempotentReplay: true,
      };
    }

    const current = await transaction.getCurrentClassificationForUpdate(captureId, userId);
    if ((current?.classificationId ?? null) !== expectedCurrentClassificationId) {
      throw new BrainDumpNotNowError("CURRENT_CLASSIFICATION_CHANGED");
    }
    if (current?.category === category) {
      throw new BrainDumpNotNowError("CLASSIFICATION_UNCHANGED");
    }

    const recordedAt = normalizedBrainDumpInstant(dependencies.clock.now(), "INVALID_CLASSIFICATION");
    if (Date.parse(recordedAt) < Date.parse(confirmedAt)) {
      throw new BrainDumpNotNowError("INVALID_CLASSIFICATION");
    }
    const classificationId = requiredBrainDumpOpaqueId(
      dependencies.ids.next("classification"),
      "INVALID_CLASSIFICATION",
    );
    const eventId = requiredBrainDumpOpaqueId(dependencies.ids.next("event"), "INVALID_CLASSIFICATION");

    if (current) {
      await transaction.supersedeCurrentClassification(current.classificationId, userId, recordedAt);
    }
    await transaction.createClassification({
      classificationId,
      captureId,
      userId,
      category,
      status: "CURRENT",
      confirmedAt,
      recordedAt,
      ...(current ? { supersedesClassificationId: current.classificationId } : {}),
      requestId,
      requestFingerprint,
    });
    await transaction.appendDomainEvent({
      eventId,
      userId,
      occurredAt: confirmedAt,
      recordedAt,
      actorType: "USER",
      actorId: userId,
      eventType: "BRAIN_DUMP_CLASSIFICATION_CONFIRMED",
      entityType: "brain_dump_classification",
      entityId: classificationId,
      source: context.source,
      correlationId: requestId,
      payloadJson: {
        captureId,
        category,
        authorityClass: "DECISION",
        ...(current ? { supersededClassificationId: current.classificationId } : {}),
      },
      schemaVersion: 1,
    });

    return {
      classificationId,
      captureId,
      category,
      status: "CURRENT",
      authorityClass: "DECISION",
      confirmedAt,
      recordedAt,
      ...(current ? { supersededClassificationId: current.classificationId } : {}),
      idempotentReplay: false,
    };
  });
}
