import type { DailyReturnOverview } from "../../../packages/contracts/daily-return";
import type {
  DailyLogEntryReadRecord,
  DailyReturnReader,
  DailyReturnReviewReadRecord,
} from "../../../packages/domain/daily-return-read";
import type { AuthenticatedUserPrincipal } from "../../../packages/domain/write-boundary";

const MAX_LOG_ENTRIES = 200;
const MAX_REVIEW_HISTORY = 20;

export type DailyReturnOverviewReadErrorCode =
  | "INVALID_PRINCIPAL"
  | "INVALID_DATE"
  | "DAILY_RETURN_STATE_INVALID"
  | "DAILY_RETURN_LIMIT_EXCEEDED";

export class DailyReturnOverviewReadError extends Error {
  constructor(readonly code: DailyReturnOverviewReadErrorCode) {
    super(code);
    this.name = "DailyReturnOverviewReadError";
  }
}

export interface DailyReturnOverviewReadContext {
  principal: AuthenticatedUserPrincipal;
  localDate: string;
}

export interface DailyReturnOverviewReadDependencies {
  reader: DailyReturnReader;
}

function requiredUserId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new DailyReturnOverviewReadError("INVALID_PRINCIPAL");
  return normalized;
}

function requiredLocalDate(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new DailyReturnOverviewReadError("INVALID_DATE");
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const instant = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    instant.getUTCFullYear() !== year
    || instant.getUTCMonth() + 1 !== month
    || instant.getUTCDate() !== day
  ) {
    throw new DailyReturnOverviewReadError("INVALID_DATE");
  }
  return normalized;
}

function validInstant(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validTimeZone(value: string): boolean {
  if (typeof value !== "string" || !value.trim() || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function validReflection(value: string): boolean {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= 4000;
}

function validateEntry(record: DailyLogEntryReadRecord, userId: string, localDate: string): void {
  if (
    record.userId !== userId
    || record.localDate !== localDate
    || !record.entryId?.trim()
    || !validTimeZone(record.timeZone)
    || !validReflection(record.body)
    || !validInstant(record.occurredAt)
    || !validInstant(record.recordedAt)
    || Date.parse(record.recordedAt) < Date.parse(record.occurredAt)
  ) {
    throw new DailyReturnOverviewReadError("DAILY_RETURN_STATE_INVALID");
  }
}

function validateReview(record: DailyReturnReviewReadRecord, userId: string, localDate: string): void {
  if (
    record.userId !== userId
    || record.localDate !== localDate
    || !record.reviewId?.trim()
    || !validTimeZone(record.timeZone)
    || !validReflection(record.whatHappened)
    || !validReflection(record.whatMovedForward)
    || !validReflection(record.whatPulledMeAway)
    || !validReflection(record.returnToTomorrow)
    || !["RETURNED", "STILL_RETURNING", "NO_DRIFT_NOTICED"].includes(record.returnState)
    || !validInstant(record.submittedAt)
    || !validInstant(record.recordedAt)
    || Date.parse(record.recordedAt) < Date.parse(record.submittedAt)
  ) {
    throw new DailyReturnOverviewReadError("DAILY_RETURN_STATE_INVALID");
  }

  if (record.status === "CURRENT" && record.endedAt === null) return;
  if (
    record.status === "SUPERSEDED"
    && typeof record.endedAt === "string"
    && validInstant(record.endedAt)
    && Date.parse(record.endedAt) >= Date.parse(record.recordedAt)
  ) {
    return;
  }
  throw new DailyReturnOverviewReadError("DAILY_RETURN_STATE_INVALID");
}

export async function getDailyReturnOverview(
  context: DailyReturnOverviewReadContext,
  dependencies: DailyReturnOverviewReadDependencies,
): Promise<DailyReturnOverview> {
  const userId = requiredUserId(context.principal.userId);
  const localDate = requiredLocalDate(context.localDate);
  const [entries, reviews] = await Promise.all([
    dependencies.reader.listLogEntriesForDate(userId, localDate, MAX_LOG_ENTRIES + 1),
    dependencies.reader.listReviewsForDate(userId, localDate, MAX_REVIEW_HISTORY + 2),
  ]);

  if (entries.length > MAX_LOG_ENTRIES || reviews.length > MAX_REVIEW_HISTORY + 1) {
    throw new DailyReturnOverviewReadError("DAILY_RETURN_LIMIT_EXCEEDED");
  }
  for (const entry of entries) validateEntry(entry, userId, localDate);
  for (const review of reviews) validateReview(review, userId, localDate);

  const current = reviews.filter((review) => review.status === "CURRENT");
  const history = reviews.filter(
    (review): review is DailyReturnReviewReadRecord & { status: "SUPERSEDED"; endedAt: string } =>
      review.status === "SUPERSEDED" && review.endedAt !== null,
  );
  if (current.length > 1 || history.length > MAX_REVIEW_HISTORY) {
    throw new DailyReturnOverviewReadError("DAILY_RETURN_STATE_INVALID");
  }

  return {
    localDate,
    logEntries: [...entries]
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
      .map((entry) => ({
        id: entry.entryId,
        localDate: entry.localDate,
        timeZone: entry.timeZone,
        body: entry.body,
        authorityClass: "REFLECTION",
        occurredAt: entry.occurredAt,
        recordedAt: entry.recordedAt,
      })),
    currentReview: current[0]
      ? {
          id: current[0].reviewId,
          localDate: current[0].localDate,
          timeZone: current[0].timeZone,
          whatHappened: current[0].whatHappened,
          whatMovedForward: current[0].whatMovedForward,
          whatPulledMeAway: current[0].whatPulledMeAway,
          returnToTomorrow: current[0].returnToTomorrow,
          returnState: current[0].returnState,
          status: "CURRENT",
          authorityClass: "REFLECTION",
          submittedAt: current[0].submittedAt,
          recordedAt: current[0].recordedAt,
        }
      : null,
    reviewHistory: history.map((review) => ({
      id: review.reviewId,
      localDate: review.localDate,
      timeZone: review.timeZone,
      whatHappened: review.whatHappened,
      whatMovedForward: review.whatMovedForward,
      whatPulledMeAway: review.whatPulledMeAway,
      returnToTomorrow: review.returnToTomorrow,
      returnState: review.returnState,
      status: "SUPERSEDED",
      authorityClass: "REFLECTION",
      submittedAt: review.submittedAt,
      recordedAt: review.recordedAt,
      endedAt: review.endedAt,
    })),
  };
}
