import { createHash } from "node:crypto";
import type {
  NotNowItemReceipt,
  ReviewNotNowItemCommand,
} from "../../../packages/contracts/brain-dump-not-now";
import {
  canReviewNotNowState,
  postureForReviewedState,
  type BrainDumpNotNowClock,
  type BrainDumpNotNowIdGenerator,
  type BrainDumpNotNowRequestContext,
  type BrainDumpNotNowUnitOfWork,
} from "../../../packages/domain/brain-dump-not-now";
import {
  BrainDumpNotNowError,
  normalizedBrainDumpInstant,
  normalizedExpectedRevision,
  normalizedNotNowReviewNote,
  normalizedNotNowState,
  requiredBrainDumpOpaqueId,
  requiredBrainDumpRequestId,
} from "./brain-dump-not-now-validation";

export interface ReviewNotNowItemDependencies {
  unitOfWork: BrainDumpNotNowUnitOfWork;
  clock: BrainDumpNotNowClock;
  ids: BrainDumpNotNowIdGenerator;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function reviewNotNowItem(
  rootIdInput: string,
  command: ReviewNotNowItemCommand,
  context: BrainDumpNotNowRequestContext,
  dependencies: ReviewNotNowItemDependencies,
): Promise<NotNowItemReceipt> {
  const userId = requiredBrainDumpOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const rootId = requiredBrainDumpOpaqueId(rootIdInput, "INVALID_NOT_NOW_ITEM");
  const targetState = normalizedNotNowState(command.targetState);
  const reviewNote = normalizedNotNowReviewNote(command.reviewNote);
  const expectedCurrentRevision = normalizedExpectedRevision(command.expectedCurrentRevision);
  const requestId = requiredBrainDumpRequestId(context.requestId, "not_now_review");
  const decidedAt = normalizedBrainDumpInstant(context.receivedAt, "INVALID_NOT_NOW_ITEM");
  const requestFingerprint = fingerprint({ rootId, targetState, reviewNote, expectedCurrentRevision });

  return dependencies.unitOfWork.run(userId, async (transaction) => {
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
        ...(replay.supersedesItemId ? { supersededItemId: replay.supersedesItemId } : {}),
        idempotentReplay: true,
      };
    }

    const current = await transaction.getCurrentNotNowItemForUpdate(rootId, userId);
    if (!current) throw new BrainDumpNotNowError("NOT_NOW_ITEM_NOT_FOUND");
    if (current.revision !== expectedCurrentRevision) {
      throw new BrainDumpNotNowError("NOT_NOW_ITEM_CHANGED");
    }
    if (!canReviewNotNowState(current.state, targetState)) {
      throw new BrainDumpNotNowError("NOT_NOW_TRANSITION_NOT_ALLOWED");
    }

    const recordedAt = normalizedBrainDumpInstant(dependencies.clock.now(), "INVALID_NOT_NOW_ITEM");
    if (Date.parse(recordedAt) < Date.parse(decidedAt)) {
      throw new BrainDumpNotNowError("INVALID_NOT_NOW_ITEM");
    }
    const itemId = requiredBrainDumpOpaqueId(dependencies.ids.next("not-now"), "INVALID_NOT_NOW_ITEM");
    const eventId = requiredBrainDumpOpaqueId(dependencies.ids.next("event"), "INVALID_NOT_NOW_ITEM");
    const posture = postureForReviewedState(targetState, current.posture);
    const revision = current.revision + 1;

    await transaction.supersedeCurrentNotNowItem(current.itemId, userId, recordedAt);
    await transaction.createNotNowItem({
      itemId,
      rootId,
      revision,
      captureId: current.captureId,
      classificationId: current.classificationId,
      userId,
      assessment: current.assessment,
      posture,
      state: targetState,
      status: "CURRENT",
      ...(reviewNote ? { reviewNote } : {}),
      decidedAt,
      recordedAt,
      supersedesItemId: current.itemId,
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
      eventType: "NOT_NOW_ITEM_REVIEWED",
      entityType: "not_now_item",
      entityId: itemId,
      source: context.source,
      correlationId: requestId,
      payloadJson: {
        captureId: current.captureId,
        rootId,
        revision,
        previousState: current.state,
        state: targetState,
        posture,
        authorityClass: "DECISION",
        ...(reviewNote ? { reviewNote } : {}),
        supersededItemId: current.itemId,
      },
      schemaVersion: 1,
    });

    return {
      itemId,
      rootId,
      captureId: current.captureId,
      revision,
      state: targetState,
      status: "CURRENT",
      authorityClass: "DECISION",
      decidedAt,
      recordedAt,
      supersededItemId: current.itemId,
      idempotentReplay: false,
    };
  });
}
