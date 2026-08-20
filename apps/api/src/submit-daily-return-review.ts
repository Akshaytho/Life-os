import { createHash } from "node:crypto";
import type {
  DailyReturnReviewReceipt,
  DailyReturnReviewStatus,
  SubmitDailyReturnReviewCommand,
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
  normalizedReturnState,
  normalizedTimeZone,
  requiredDailyReturnRequestId,
  requiredOpaqueId,
} from "./daily-return-validation";

export interface SubmitDailyReturnReviewDependencies {
  unitOfWork: DailyReturnUnitOfWork;
  clock: DailyReturnClock;
  ids: DailyReturnIdGenerator;
}

function expectedReviewId(value: string | null): string | null {
  if (value === null) return null;
  return requiredOpaqueId(value, "INVALID_REVIEW");
}

function fingerprint(command: SubmitDailyReturnReviewCommand): string {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

function replayReceipt(
  existing: {
    reviewId: string;
    localDate: string;
    status: DailyReturnReviewStatus;
    submittedAt: string;
    recordedAt: string;
    supersedesReviewId?: string;
    requestFingerprint: string;
  },
  expectedFingerprint: string,
): DailyReturnReviewReceipt {
  if (existing.requestFingerprint !== expectedFingerprint) {
    throw new DailyReturnError("IDEMPOTENCY_CONFLICT");
  }
  return {
    reviewId: existing.reviewId,
    localDate: existing.localDate,
    status: existing.status,
    authorityClass: "REFLECTION",
    submittedAt: existing.submittedAt,
    recordedAt: existing.recordedAt,
    ...(existing.supersedesReviewId ? { supersededReviewId: existing.supersedesReviewId } : {}),
    idempotentReplay: true,
  };
}

export async function submitDailyReturnReview(
  command: SubmitDailyReturnReviewCommand,
  context: DailyReturnRequestContext,
  dependencies: SubmitDailyReturnReviewDependencies,
): Promise<DailyReturnReviewReceipt> {
  const userId = requiredOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const requestId = requiredDailyReturnRequestId(context.requestId, "daily_return_submit");
  const normalized = {
    localDate: normalizedLocalDate(command.localDate),
    timeZone: normalizedTimeZone(command.timeZone),
    whatHappened: normalizedReflection(command.whatHappened, "INVALID_REVIEW"),
    whatMovedForward: normalizedReflection(command.whatMovedForward, "INVALID_REVIEW"),
    whatPulledMeAway: normalizedReflection(command.whatPulledMeAway, "INVALID_REVIEW"),
    returnToTomorrow: normalizedReflection(command.returnToTomorrow, "INVALID_REVIEW"),
    returnState: normalizedReturnState(command.returnState),
    expectedCurrentReviewId: expectedReviewId(command.expectedCurrentReviewId),
  };
  const requestFingerprint = fingerprint(normalized);
  const submittedAt = normalizedInstant(context.receivedAt, "INVALID_REVIEW");

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const existing = await transaction.findReviewByRequestId(requestId, userId);
    if (existing) return replayReceipt(existing, requestFingerprint);

    const current = await transaction.getCurrentReviewForUpdate(userId, normalized.localDate);
    const actualCurrentReviewId = current?.reviewId ?? null;
    if (actualCurrentReviewId !== normalized.expectedCurrentReviewId) {
      throw new DailyReturnError("CURRENT_REVIEW_CHANGED");
    }
    if (
      current
      && current.timeZone === normalized.timeZone
      && current.whatHappened === normalized.whatHappened
      && current.whatMovedForward === normalized.whatMovedForward
      && current.whatPulledMeAway === normalized.whatPulledMeAway
      && current.returnToTomorrow === normalized.returnToTomorrow
      && current.returnState === normalized.returnState
    ) {
      throw new DailyReturnError("REVIEW_UNCHANGED");
    }

    const recordedAt = normalizedInstant(dependencies.clock.now(), "INVALID_REVIEW");
    if (Date.parse(recordedAt) < Date.parse(submittedAt)) {
      throw new DailyReturnError("INVALID_REVIEW");
    }

    const reviewId = requiredOpaqueId(dependencies.ids.next("daily-review"), "INVALID_REVIEW");
    const eventId = requiredOpaqueId(dependencies.ids.next("event"), "INVALID_REVIEW");

    if (current) {
      await transaction.supersedeCurrentReview(current.reviewId, userId, recordedAt);
    }

    await transaction.createReview({
      reviewId,
      userId,
      localDate: normalized.localDate,
      timeZone: normalized.timeZone,
      whatHappened: normalized.whatHappened,
      whatMovedForward: normalized.whatMovedForward,
      whatPulledMeAway: normalized.whatPulledMeAway,
      returnToTomorrow: normalized.returnToTomorrow,
      returnState: normalized.returnState,
      status: "CURRENT",
      submittedAt,
      recordedAt,
      ...(current ? { supersedesReviewId: current.reviewId } : {}),
      requestId,
      requestFingerprint,
    });
    await transaction.appendDomainEvent({
      eventId,
      userId,
      occurredAt: submittedAt,
      recordedAt,
      actorType: "USER",
      actorId: userId,
      eventType: current ? "DAILY_RETURN_REVIEW_REVISED" : "DAILY_RETURN_REVIEW_SUBMITTED",
      entityType: "daily_return_review",
      entityId: reviewId,
      source: context.source,
      correlationId: requestId,
      payloadJson: {
        authorityClass: "REFLECTION",
        localDate: normalized.localDate,
        timeZone: normalized.timeZone,
        whatHappened: normalized.whatHappened,
        whatMovedForward: normalized.whatMovedForward,
        whatPulledMeAway: normalized.whatPulledMeAway,
        returnToTomorrow: normalized.returnToTomorrow,
        returnState: normalized.returnState,
        ...(current ? { supersededReviewId: current.reviewId } : {}),
      },
      schemaVersion: 1,
    });

    return {
      reviewId,
      localDate: normalized.localDate,
      status: "CURRENT",
      authorityClass: "REFLECTION",
      submittedAt,
      recordedAt,
      ...(current ? { supersededReviewId: current.reviewId } : {}),
      idempotentReplay: false,
    };
  });
}
