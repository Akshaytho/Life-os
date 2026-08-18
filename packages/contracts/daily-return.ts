export type DailyReturnState = "RETURNED" | "STILL_RETURNING" | "NO_DRIFT_NOTICED";
export type DailyReturnReviewStatus = "CURRENT" | "SUPERSEDED";

export interface DailyLogEntry {
  id: string;
  localDate: string;
  timeZone: string;
  body: string;
  authorityClass: "REFLECTION";
  occurredAt: string;
  recordedAt: string;
}

export interface CurrentDailyReturnReview {
  id: string;
  localDate: string;
  timeZone: string;
  whatHappened: string;
  whatMovedForward: string;
  whatPulledMeAway: string;
  returnToTomorrow: string;
  returnState: DailyReturnState;
  status: "CURRENT";
  authorityClass: "REFLECTION";
  submittedAt: string;
  recordedAt: string;
}

export interface HistoricalDailyReturnReview
  extends Omit<CurrentDailyReturnReview, "status"> {
  status: "SUPERSEDED";
  endedAt: string;
}

export interface DailyReturnOverview {
  localDate: string;
  logEntries: DailyLogEntry[];
  currentReview: CurrentDailyReturnReview | null;
  reviewHistory: HistoricalDailyReturnReview[];
}

export interface AppendDailyLogEntryCommand {
  localDate: string;
  timeZone: string;
  body: string;
}

export interface DailyLogEntryReceipt {
  entryId: string;
  localDate: string;
  authorityClass: "REFLECTION";
  occurredAt: string;
  recordedAt: string;
  idempotentReplay: boolean;
}

export interface SubmitDailyReturnReviewCommand {
  localDate: string;
  timeZone: string;
  whatHappened: string;
  whatMovedForward: string;
  whatPulledMeAway: string;
  returnToTomorrow: string;
  returnState: DailyReturnState;
  expectedCurrentReviewId: string | null;
}

export interface DailyReturnReviewReceipt {
  reviewId: string;
  localDate: string;
  status: DailyReturnReviewStatus;
  authorityClass: "REFLECTION";
  submittedAt: string;
  recordedAt: string;
  supersededReviewId?: string;
  idempotentReplay: boolean;
}
