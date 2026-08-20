export type PeriodicReviewKind = "WEEK" | "MONTH";
export type PeriodicReviewStatus = "CURRENT" | "SUPERSEDED";
export type PeriodicReviewSourceDomain =
  | "DAILY_RETURN"
  | "CALENDAR"
  | "JOURNEY"
  | "DRIFT"
  | "NOT_NOW"
  | "WEEKLY_REVIEW";
export type PeriodicReviewSourceAuthority = "FACT" | "REFLECTION" | "DECISION" | "USER_SOURCE";

export interface PeriodicReviewIdentity {
  kind: PeriodicReviewKind;
  periodStart: string;
  periodEnd: string;
  timeZone: string;
}

export interface PeriodicReviewSource {
  sourceId: string;
  domain: PeriodicReviewSourceDomain;
  authorityClass: PeriodicReviewSourceAuthority;
  title: string;
  excerpt: string;
  occurredAt: string;
  localDate?: string;
}

export interface PeriodicReviewSourceCounts {
  dailyLogEntries: number;
  dailyReviews: number;
  calendarEvents: number;
  scheduledMinutes: number;
  journeyPractices: number;
  driftOccurrences: number;
  notNowItems: number;
  weeklyReviews: number;
}

export interface CurrentPeriodicReview extends PeriodicReviewIdentity {
  id: string;
  whatMattered: string;
  whatChanged: string;
  whatMovedForward: string;
  driftAndReturn: string;
  whatWasLearned: string;
  carryForward: string;
  worthPreserving?: string;
  status: "CURRENT";
  authorityClass: "REFLECTION";
  submittedAt: string;
  recordedAt: string;
}

export interface HistoricalPeriodicReview extends Omit<CurrentPeriodicReview, "status"> {
  status: "SUPERSEDED";
  endedAt: string;
}

export interface PeriodicReviewOverview extends PeriodicReviewIdentity {
  previousPeriodStart: string;
  nextPeriodStart: string;
  currentReview: CurrentPeriodicReview | null;
  reviewHistory: HistoricalPeriodicReview[];
  sourceCounts: PeriodicReviewSourceCounts;
  sources: PeriodicReviewSource[];
}

export interface GetPeriodicReviewOverviewCommand extends PeriodicReviewIdentity {
  calendarFrom: string;
  calendarTo: string;
}

export interface SubmitPeriodicReviewCommand extends PeriodicReviewIdentity {
  whatMattered: string;
  whatChanged: string;
  whatMovedForward: string;
  driftAndReturn: string;
  whatWasLearned: string;
  carryForward: string;
  worthPreserving?: string;
  expectedCurrentReviewId: string | null;
}

export interface PeriodicReviewReceipt extends PeriodicReviewIdentity {
  reviewId: string;
  status: PeriodicReviewStatus;
  authorityClass: "REFLECTION";
  submittedAt: string;
  recordedAt: string;
  supersededReviewId?: string;
  idempotentReplay: boolean;
}
