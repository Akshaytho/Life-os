import type {
  CurrentPeriodicReview,
  GetPeriodicReviewOverviewCommand,
  HistoricalPeriodicReview,
  PeriodicReviewOverview,
  PeriodicReviewSource,
} from "../../../packages/contracts/periodic-reviews";
import type { BrainDumpNotNowReader } from "../../../packages/domain/brain-dump-not-now-read";
import type { CanonicalCalendarReader } from "../../../packages/domain/canonical-calendar-read";
import type { DailyReturnReader } from "../../../packages/domain/daily-return-read";
import type { DriftReader } from "../../../packages/domain/drift-return-read";
import type { JourneyPracticeReader } from "../../../packages/domain/journey-practice-read";
import type { PeriodicReviewReader, PeriodicReviewReadRecord } from "../../../packages/domain/periodic-reviews-read";
import type { AuthenticatedUserPrincipal } from "../../../packages/domain/write-boundary";
import {
  adjacentPeriodStarts,
  datePlus,
  periodicCalendarWindow,
  periodicIdentity,
  periodicOpaqueId,
  PeriodicReviewsError,
} from "./periodic-reviews-validation";

const MAX_SOURCES = 160;

export interface GetPeriodicReviewOverviewDependencies {
  periodicReviewReader: PeriodicReviewReader;
  dailyReturnReader: DailyReturnReader;
  calendarReader: CanonicalCalendarReader;
  journeyPracticeReader: JourneyPracticeReader;
  driftReader: DriftReader;
  brainDumpNotNowReader: BrainDumpNotNowReader;
}

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let value = start; value <= end; value = datePlus(value, 1)) {
    dates.push(value);
    if (dates.length > 31) throw new PeriodicReviewsError("INVALID_PERIOD");
  }
  return dates;
}

function clippedMinutes(startsAt: string, endsAt: string, from: string, to: string) {
  const start = Math.max(Date.parse(startsAt), Date.parse(from));
  const end = Math.min(Date.parse(endsAt), Date.parse(to));
  return Math.max(0, Math.round((end - start) / 60_000));
}

function excerpt(parts: Array<string | undefined | null>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ").slice(0, 1200);
}

function validateReview(record: PeriodicReviewReadRecord, userId: string) {
  if (
    record.userId !== userId
    || !record.reviewId.trim()
    || !Number.isFinite(Date.parse(record.submittedAt))
    || !Number.isFinite(Date.parse(record.recordedAt))
    || Date.parse(record.recordedAt) < Date.parse(record.submittedAt)
    || (record.status === "CURRENT" && record.endedAt !== null)
    || (record.status === "SUPERSEDED" && (
      record.endedAt === null || Date.parse(record.endedAt) < Date.parse(record.recordedAt)
    ))
  ) throw new PeriodicReviewsError("PERIODIC_REVIEW_STATE_INVALID");
}

function currentReview(record: PeriodicReviewReadRecord): CurrentPeriodicReview {
  return {
    id: record.reviewId,
    kind: record.kind,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    timeZone: record.timeZone,
    whatMattered: record.whatMattered,
    whatChanged: record.whatChanged,
    whatMovedForward: record.whatMovedForward,
    driftAndReturn: record.driftAndReturn,
    whatWasLearned: record.whatWasLearned,
    carryForward: record.carryForward,
    ...(record.worthPreserving ? { worthPreserving: record.worthPreserving } : {}),
    status: "CURRENT",
    authorityClass: "REFLECTION",
    submittedAt: record.submittedAt,
    recordedAt: record.recordedAt,
  };
}

function historicalReview(
  record: PeriodicReviewReadRecord & { status: "SUPERSEDED"; endedAt: string },
): HistoricalPeriodicReview {
  return { ...currentReview({ ...record, status: "CURRENT", endedAt: null }), status: "SUPERSEDED", endedAt: record.endedAt };
}

export async function getPeriodicReviewOverview(
  command: GetPeriodicReviewOverviewCommand,
  principal: AuthenticatedUserPrincipal,
  dependencies: GetPeriodicReviewOverviewDependencies,
): Promise<PeriodicReviewOverview> {
  const userId = periodicOpaqueId(principal.userId, "INVALID_PRINCIPAL");
  const identity = periodicIdentity(command);
  const window = periodicCalendarWindow(identity, command.calendarFrom, command.calendarTo);
  const dates = datesBetween(identity.periodStart, identity.periodEnd);

  const daily = Promise.all(dates.map(async (localDate) => {
    const [entries, reviews] = await Promise.all([
      dependencies.dailyReturnReader.listLogEntriesForDate(userId, localDate, 201),
      dependencies.dailyReturnReader.listReviewsForDate(userId, localDate, 22),
    ]);
    return { localDate, entries, reviews };
  }));
  const [reviews, dailyRows, calendar, journey, drift, notNow, weekly] = await Promise.all([
    dependencies.periodicReviewReader.listReviews(userId, identity, 22),
    daily,
    dependencies.calendarReader.listOverlapping(userId, window.from, window.to),
    dependencies.journeyPracticeReader.getSnapshot(userId, 101),
    dependencies.driftReader.listCurrent(userId, 101),
    dependencies.brainDumpNotNowReader.listNotNowItems(userId, 101),
    identity.kind === "MONTH"
      ? dependencies.periodicReviewReader.listCurrentInRange(
        userId, "WEEK", identity.periodStart, identity.periodEnd, 6,
      )
      : Promise.resolve([]),
  ]);

  for (const review of [...reviews, ...weekly]) validateReview(review, userId);
  const current = reviews.filter((review) => review.status === "CURRENT");
  const history = reviews.filter(
    (review): review is PeriodicReviewReadRecord & { status: "SUPERSEDED"; endedAt: string } =>
      review.status === "SUPERSEDED" && review.endedAt !== null,
  );
  if (current.length > 1 || history.length > 20) {
    throw new PeriodicReviewsError("PERIODIC_REVIEW_STATE_INVALID");
  }

  const sources: PeriodicReviewSource[] = [];
  let dailyLogEntries = 0;
  let dailyReviews = 0;
  for (const day of dailyRows) {
    dailyLogEntries += day.entries.length;
    for (const entry of day.entries) {
      sources.push({
        sourceId: `daily-log:${entry.entryId}`,
        domain: "DAILY_RETURN",
        authorityClass: "REFLECTION",
        title: `Daily note · ${day.localDate}`,
        excerpt: entry.body,
        occurredAt: entry.occurredAt,
        localDate: day.localDate,
      });
    }
    const dayCurrent = day.reviews.find((review) => review.status === "CURRENT");
    if (dayCurrent) {
      dailyReviews += 1;
      sources.push({
        sourceId: `daily-review:${dayCurrent.reviewId}`,
        domain: "DAILY_RETURN",
        authorityClass: "REFLECTION",
        title: `Daily Return · ${day.localDate}`,
        excerpt: excerpt([
          dayCurrent.whatHappened,
          dayCurrent.whatMovedForward,
          dayCurrent.whatPulledMeAway,
          dayCurrent.returnToTomorrow,
          dayCurrent.returnState,
        ]),
        occurredAt: dayCurrent.submittedAt,
        localDate: day.localDate,
      });
    }
  }

  let scheduledMinutes = 0;
  for (const event of calendar) {
    scheduledMinutes += clippedMinutes(event.startsAt, event.endsAt, window.from, window.to);
    sources.push({
      sourceId: `calendar:${event.id}`,
      domain: "CALENDAR",
      authorityClass: "FACT",
      title: event.title,
      excerpt: `${event.category} · ${event.commitment}`,
      occurredAt: event.startsAt,
    });
  }

  let journeyPractices = 0;
  for (const row of journey.sessions) {
    if (!row.completion || row.completion.completedAt < window.from || row.completion.completedAt >= window.to) continue;
    journeyPractices += 1;
    sources.push({
      sourceId: `journey-practice:${row.session.sessionId}`,
      domain: "JOURNEY",
      authorityClass: "FACT",
      title: `Practice · ${row.session.technique.replaceAll("_", " ")}`,
      excerpt: excerpt([row.session.experimentIntention, row.completion.reflectionNote]),
      occurredAt: row.completion.completedAt,
    });
  }

  let driftOccurrences = 0;
  for (const row of drift) {
    if (row.occurrence.occurredAt < window.from || row.occurrence.occurredAt >= window.to) continue;
    driftOccurrences += 1;
    sources.push({
      sourceId: `drift:${row.occurrence.driftId}`,
      domain: "DRIFT",
      authorityClass: "USER_SOURCE",
      title: "Drift occurrence",
      excerpt: row.occurrence.sourceNote ?? "Drift recorded without a source note.",
      occurredAt: row.occurrence.occurredAt,
    });
    const decision = row.decisions.find((value) => value.status === "CURRENT");
    if (decision) sources.push({
      sourceId: `drift:${row.occurrence.driftId}:decision`,
      domain: "DRIFT",
      authorityClass: "DECISION",
      title: "Drift understanding and return posture",
      excerpt: excerpt([decision.explanation, decision.returnPosture, decision.lifecycleState]),
      occurredAt: decision.decidedAt,
    });
  }

  let notNowItems = 0;
  for (const item of notNow) {
    if (item.decidedAt < window.from || item.decidedAt >= window.to) continue;
    notNowItems += 1;
    sources.push({
      sourceId: `not-now:${item.rootId}:r${item.revision}`,
      domain: "NOT_NOW",
      authorityClass: "DECISION",
      title: `NOT NOW · ${item.posture.replaceAll("_", " ")}`,
      excerpt: excerpt([item.rawText, item.reviewNote]),
      occurredAt: item.decidedAt,
    });
  }

  for (const review of weekly) sources.push({
    sourceId: `weekly-review:${review.reviewId}`,
    domain: "WEEKLY_REVIEW",
    authorityClass: "REFLECTION",
    title: `Week of ${review.periodStart}`,
    excerpt: excerpt([review.whatMattered, review.carryForward]),
    occurredAt: review.submittedAt,
    localDate: review.periodStart,
  });

  if (sources.length > MAX_SOURCES) throw new PeriodicReviewsError("PERIODIC_REVIEW_LIMIT_EXCEEDED");
  sources.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || left.sourceId.localeCompare(right.sourceId));
  return {
    ...identity,
    ...adjacentPeriodStarts(identity),
    currentReview: current[0] ? currentReview(current[0]) : null,
    reviewHistory: history.map(historicalReview),
    sourceCounts: {
      dailyLogEntries,
      dailyReviews,
      calendarEvents: calendar.length,
      scheduledMinutes,
      journeyPractices,
      driftOccurrences,
      notNowItems,
      weeklyReviews: weekly.length,
    },
    sources,
  };
}
