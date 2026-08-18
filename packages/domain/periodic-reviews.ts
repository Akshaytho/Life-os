import type {
  PeriodicReviewKind,
  PeriodicReviewStatus,
} from "../contracts/periodic-reviews";
import type { WriteRequestContext, WriteSource } from "./write-boundary";

export interface PeriodicReviewRecord {
  reviewId: string;
  userId: string;
  kind: PeriodicReviewKind;
  periodStart: string;
  periodEnd: string;
  timeZone: string;
  whatMattered: string;
  whatChanged: string;
  whatMovedForward: string;
  driftAndReturn: string;
  whatWasLearned: string;
  carryForward: string;
  worthPreserving?: string;
  status: PeriodicReviewStatus;
  submittedAt: string;
  recordedAt: string;
  endedAt?: string;
  supersedesReviewId?: string;
  requestId: string;
  requestFingerprint: string;
}

export interface PeriodicReviewDomainEventRecord {
  eventId: string;
  userId: string;
  occurredAt: string;
  recordedAt: string;
  actorType: "USER";
  actorId: string;
  eventType: "PERIODIC_REVIEW_SUBMITTED" | "PERIODIC_REVIEW_REVISED";
  entityType: "periodic_review";
  entityId: string;
  source: WriteSource;
  correlationId: string;
  payloadJson: {
    authorityClass: "REFLECTION";
    kind: PeriodicReviewKind;
    periodStart: string;
    periodEnd: string;
    timeZone: string;
    supersededReviewId?: string;
  };
  schemaVersion: 1;
}

export interface PeriodicReviewTransaction {
  findByRequestId(requestId: string, userId: string): Promise<PeriodicReviewRecord | undefined>;
  getCurrentForUpdate(
    userId: string,
    kind: PeriodicReviewKind,
    periodStart: string,
  ): Promise<PeriodicReviewRecord | undefined>;
  supersede(reviewId: string, userId: string, endedAt: string): Promise<void>;
  create(record: PeriodicReviewRecord): Promise<void>;
  appendDomainEvent(event: PeriodicReviewDomainEventRecord): Promise<void>;
}

export interface PeriodicReviewUnitOfWork {
  run<T>(authenticatedUserId: string, work: (transaction: PeriodicReviewTransaction) => Promise<T>): Promise<T>;
}

export interface PeriodicReviewClock { now(): string }
export interface PeriodicReviewIdGenerator { next(prefix: "periodic-review" | "event"): string }
export type PeriodicReviewRequestContext = WriteRequestContext;
