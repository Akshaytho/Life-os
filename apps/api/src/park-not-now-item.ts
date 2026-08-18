import { createHash } from "node:crypto";
import type {
  NotNowItemReceipt,
  ParkNotNowItemCommand,
} from "../../../packages/contracts/brain-dump-not-now";
import {
  initialNotNowState,
  type BrainDumpNotNowClock,
  type BrainDumpNotNowIdGenerator,
  type BrainDumpNotNowRequestContext,
  type BrainDumpNotNowUnitOfWork,
} from "../../../packages/domain/brain-dump-not-now";
import {
  BrainDumpNotNowError,
  normalizedBrainDumpInstant,
  normalizedNotNowAssessment,
  normalizedNotNowPosture,
  requiredBrainDumpOpaqueId,
  requiredBrainDumpRequestId,
} from "./brain-dump-not-now-validation";

export interface ParkNotNowItemDependencies {
  unitOfWork: BrainDumpNotNowUnitOfWork;
  clock: BrainDumpNotNowClock;
  ids: BrainDumpNotNowIdGenerator;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function parkNotNowItem(
  command: ParkNotNowItemCommand,
  context: BrainDumpNotNowRequestContext,
  dependencies: ParkNotNowItemDependencies,
): Promise<NotNowItemReceipt> {
  const userId = requiredBrainDumpOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const captureId = requiredBrainDumpOpaqueId(command.captureId, "INVALID_CAPTURE");
  const classificationId = requiredBrainDumpOpaqueId(command.classificationId, "INVALID_CLASSIFICATION");
  if (command.expectedCurrentItemId !== null) throw new BrainDumpNotNowError("INVALID_NOT_NOW_ITEM");
  const assessment = normalizedNotNowAssessment(command.assessment);
  const posture = normalizedNotNowPosture(command.posture);
  const state = initialNotNowState(posture);
  const requestId = requiredBrainDumpRequestId(context.requestId, "not_now_park");
  const decidedAt = normalizedBrainDumpInstant(context.receivedAt, "INVALID_NOT_NOW_ITEM");
  const requestFingerprint = fingerprint({ captureId, classificationId, assessment, posture });

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const capture = await transaction.getCaptureForUpdate(captureId, userId);
    if (!capture) throw new BrainDumpNotNowError("CAPTURE_NOT_FOUND");

    const replay = await transaction.findNotNowItemByRequestId(requestId, userId);
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) {
        throw new BrainDumpNotNowError("IDEMPOTENCY_CONFLICT");
      }
      return {
        itemId: replay.itemId,
        rootId: replay.rootId,
        captureId: replay.captureId,
        revision: replay.revision,
        state: replay.state,
        status: "CURRENT",
        authorityClass: "DECISION",
        decidedAt: replay.decidedAt,
        recordedAt: replay.recordedAt,
        idempotentReplay: true,
      };
    }

    const classification = await transaction.getCurrentClassificationForUpdate(captureId, userId);
    if (!classification || classification.classificationId !== classificationId || classification.category !== "NOT_NOW") {
      throw new BrainDumpNotNowError("NOT_NOW_CLASSIFICATION_REQUIRED");
    }
    if (await transaction.getCurrentNotNowItemForCapture(captureId, userId)) {
      throw new BrainDumpNotNowError("NOT_NOW_ITEM_EXISTS");
    }

    const recordedAt = normalizedBrainDumpInstant(dependencies.clock.now(), "INVALID_NOT_NOW_ITEM");
    if (Date.parse(recordedAt) < Date.parse(decidedAt)) {
      throw new BrainDumpNotNowError("INVALID_NOT_NOW_ITEM");
    }
    const itemId = requiredBrainDumpOpaqueId(dependencies.ids.next("not-now"), "INVALID_NOT_NOW_ITEM");
    const eventId = requiredBrainDumpOpaqueId(dependencies.ids.next("event"), "INVALID_NOT_NOW_ITEM");

    await transaction.createNotNowItem({
      itemId,
      rootId: itemId,
      revision: 1,
      captureId,
      classificationId,
      userId,
      assessment,
      posture,
      state,
      status: "CURRENT",
      decidedAt,
      recordedAt,
      requestId,
      requestFingerprint,
    });
    await transaction.appendDomainEvent({
      eventId,
      userId,
      occurredAt: decidedAt,
      recordedAt,
      actorType: "USER",
      actorId: userId,
      eventType: "NOT_NOW_ITEM_PARKED",
      entityType: "not_now_item",
      entityId: itemId,
      source: context.source,
      correlationId: requestId,
      payloadJson: {
        captureId,
        rootId: itemId,
        revision: 1,
        assessment,
        posture,
        state,
        authorityClass: "DECISION",
      },
      schemaVersion: 1,
    });

    return {
      itemId,
      rootId: itemId,
      captureId,
      revision: 1,
      state,
      status: "CURRENT",
      authorityClass: "DECISION",
      decidedAt,
      recordedAt,
      idempotentReplay: false,
    };
  });
}
