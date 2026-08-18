import { createHash } from "node:crypto";
import type {
  PeriodicReviewReceipt,
  SubmitPeriodicReviewCommand,
} from "../../../packages/contracts/periodic-reviews";
import type {
  PeriodicReviewClock,
  PeriodicReviewIdGenerator,
  PeriodicReviewRequestContext,
  PeriodicReviewUnitOfWork,
} from "../../../packages/domain/periodic-reviews";
import {
  optionalPeriodicReflection,
  periodicIdentity,
  periodicInstant,
  periodicOpaqueId,
  periodicReflection,
  periodicRequestId,
  PeriodicReviewsError,
} from "./periodic-reviews-validation";

export interface SubmitPeriodicReviewDependencies {
  unitOfWork: PeriodicReviewUnitOfWork;
  clock: PeriodicReviewClock;
  ids: PeriodicReviewIdGenerator;
}

function fingerprint(value: object): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function submitPeriodicReview(
  command: SubmitPeriodicReviewCommand,
  context: PeriodicReviewRequestContext,
  dependencies: SubmitPeriodicReviewDependencies,
): Promise<PeriodicReviewReceipt> {
  const userId = periodicOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const requestId = periodicRequestId(context.requestId);
  const identity = periodicIdentity(command);
  const normalized = {
    ...identity,
    whatMattered: periodicReflection(command.whatMattered),
    whatChanged: periodicReflection(command.whatChanged),
    whatMovedForward: periodicReflection(command.whatMovedForward),
    driftAndReturn: periodicReflection(command.driftAndReturn),
    whatWasLearned: periodicReflection(command.whatWasLearned),
    carryForward: periodicReflection(command.carryForward),
    ...(optionalPeriodicReflection(command.worthPreserving)
      ? { worthPreserving: optionalPeriodicReflection(command.worthPreserving)! }
      : {}),
    expectedCurrentReviewId: command.expectedCurrentReviewId === null
      ? null
      : periodicOpaqueId(command.expectedCurrentReviewId, "INVALID_REVIEW"),
  };
  const requestFingerprint = fingerprint(normalized);
  const submittedAt = periodicInstant(context.receivedAt);

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const replay = await transaction.findByRequestId(requestId, userId);
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) {
        throw new PeriodicReviewsError("IDEMPOTENCY_CONFLICT");
      }
      return {
        reviewId: replay.reviewId,
        kind: replay.kind,
        periodStart: replay.periodStart,
        periodEnd: replay.periodEnd,
        timeZone: replay.timeZone,
        status: replay.status,
        authorityClass: "REFLECTION",
        submittedAt: replay.submittedAt,
        recordedAt: replay.recordedAt,
        ...(replay.supersedesReviewId ? { supersededReviewId: replay.supersedesReviewId } : {}),
        idempotentReplay: true,
      };
    }

    const current = await transaction.getCurrentForUpdate(userId, identity.kind, identity.periodStart);
    if ((current?.reviewId ?? null) !== normalized.expectedCurrentReviewId) {
      throw new PeriodicReviewsError("CURRENT_REVIEW_CHANGED");
    }
    if (
      current
      && current.periodEnd === normalized.periodEnd
      && current.timeZone === normalized.timeZone
      && current.whatMattered === normalized.whatMattered
      && current.whatChanged === normalized.whatChanged
      && current.whatMovedForward === normalized.whatMovedForward
      && current.driftAndReturn === normalized.driftAndReturn
      && current.whatWasLearned === normalized.whatWasLearned
      && current.carryForward === normalized.carryForward
      && current.worthPreserving === normalized.worthPreserving
    ) throw new PeriodicReviewsError("REVIEW_UNCHANGED");

    const recordedAt = periodicInstant(dependencies.clock.now());
    if (Date.parse(recordedAt) < Date.parse(submittedAt)) {
      throw new PeriodicReviewsError("INVALID_REVIEW");
    }
    const reviewId = periodicOpaqueId(dependencies.ids.next("periodic-review"), "INVALID_REVIEW");
    const eventId = periodicOpaqueId(dependencies.ids.next("event"), "INVALID_REVIEW");
    if (current) await transaction.supersede(current.reviewId, userId, recordedAt);

    await transaction.create({
      reviewId,
      userId,
      ...identity,
      whatMattered: normalized.whatMattered,
      whatChanged: normalized.whatChanged,
      whatMovedForward: normalized.whatMovedForward,
      driftAndReturn: normalized.driftAndReturn,
      whatWasLearned: normalized.whatWasLearned,
      carryForward: normalized.carryForward,
      ...(normalized.worthPreserving ? { worthPreserving: normalized.worthPreserving } : {}),
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
      eventType: current ? "PERIODIC_REVIEW_REVISED" : "PERIODIC_REVIEW_SUBMITTED",
      entityType: "periodic_review",
      entityId: reviewId,
      source: context.source,
      correlationId: requestId,
      payloadJson: {
        authorityClass: "REFLECTION",
        ...identity,
        ...(current ? { supersededReviewId: current.reviewId } : {}),
      },
      schemaVersion: 1,
    });
    return {
      reviewId,
      ...identity,
      status: "CURRENT",
      authorityClass: "REFLECTION",
      submittedAt,
      recordedAt,
      ...(current ? { supersededReviewId: current.reviewId } : {}),
      idempotentReplay: false,
    };
  });
}
