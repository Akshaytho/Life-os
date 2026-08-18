import type {
  DailyReturnReviewStatus,
  DailyReturnState,
} from "../contracts/daily-return";
import type { WriteRequestContext, WriteSource } from "./write-boundary";

export interface DailyLogEntryRecord {
  entryId: string;
  userId: string;
  localDate: string;
  timeZone: string;
  body: string;
  occurredAt: string;
  recordedAt: string;
  requestId: string;
  requestFingerprint: string;
}

export interface DailyReturnReviewRecord {
  reviewId: string;
  userId: string;
  localDate: string;
  timeZone: string;
  whatHappened: string;
  whatMovedForward: string;
  whatPulledMeAway: string;
  returnToTomorrow: string;
  returnState: DailyReturnState;
  status: DailyReturnReviewStatus;
  submittedAt: string;
  recordedAt: string;
  endedAt?: string;
  supersedesReviewId?: string;
  requestId: string;
  requestFingerprint: string;
}

export interface DailyLogEntryDomainEventRecord {
  eventId: string;
  userId: string;
  occurredAt: string;
  recordedAt: string;
  actorType: "USER";
  actorId: string;
  eventType: "DAILY_LOG_ENTRY_RECORDED";
  entityType: "daily_log_entry";
  entityId: string;
  source: WriteSource;
  correlationId: string;
  payloadJson: {
    authorityClass: "REFLECTION";
    localDate: string;
    timeZone: string;
    body: string;
  };
  schemaVersion: 1;
}

export interface DailyReturnReviewDomainEventRecord {
  eventId: string;
  userId: string;
  occurredAt: string;
  recordedAt: string;
  actorType: "USER";
  actorId: string;
  eventType: "DAILY_RETURN_REVIEW_SUBMITTED" | "DAILY_RETURN_REVIEW_REVISED";
  entityType: "daily_return_review";
  entityId: string;
  source: WriteSource;
  correlationId: string;
  payloadJson: {
    authorityClass: "REFLECTION";
    localDate: string;
    timeZone: string;
    whatHappened: string;
    whatMovedForward: string;
    whatPulledMeAway: string;
    returnToTomorrow: string;
    returnState: DailyReturnState;
    supersededReviewId?: string;
  };
  schemaVersion: 1;
}

export type DailyReturnDomainEventRecord =
  | DailyLogEntryDomainEventRecord
  | DailyReturnReviewDomainEventRecord;

export interface DailyReturnTransaction {
  findLogEntryByRequestId(requestId: string, userId: string): Promise<DailyLogEntryRecord | undefined>;
  createLogEntry(record: DailyLogEntryRecord): Promise<void>;
  findReviewByRequestId(requestId: string, userId: string): Promise<DailyReturnReviewRecord | undefined>;
  getCurrentReviewForUpdate(userId: string, localDate: string): Promise<DailyReturnReviewRecord | undefined>;
  supersedeCurrentReview(reviewId: string, userId: string, endedAt: string): Promise<void>;
  createReview(record: DailyReturnReviewRecord): Promise<void>;
  appendDomainEvent(event: DailyReturnDomainEventRecord): Promise<void>;
}

export interface DailyReturnUnitOfWork {
  run<T>(authenticatedUserId: string, work: (transaction: DailyReturnTransaction) => Promise<T>): Promise<T>;
}

export interface DailyReturnIdGenerator {
  next(prefix: "daily-log" | "daily-review" | "event"): string;
}

export interface DailyReturnClock {
  now(): string;
}

export type DailyReturnRequestContext = WriteRequestContext;
