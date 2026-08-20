import type {
  DailyReturnReviewStatus,
  DailyReturnState,
} from "../contracts/daily-return";

export interface DailyLogEntryReadRecord {
  entryId: string;
  userId: string;
  localDate: string;
  timeZone: string;
  body: string;
  occurredAt: string;
  recordedAt: string;
}

export interface DailyReturnReviewReadRecord {
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
  endedAt: string | null;
}

export interface DailyReturnReader {
  listLogEntriesForDate(
    authenticatedUserId: string,
    localDate: string,
    limit: number,
  ): Promise<DailyLogEntryReadRecord[]>;
  listReviewsForDate(
    authenticatedUserId: string,
    localDate: string,
    limit: number,
  ): Promise<DailyReturnReviewReadRecord[]>;
}
