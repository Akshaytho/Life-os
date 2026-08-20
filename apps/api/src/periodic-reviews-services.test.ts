import assert from "node:assert/strict";
import test from "node:test";
import type { SubmitPeriodicReviewCommand } from "../../../packages/contracts/periodic-reviews";
import type {
  PeriodicReviewDomainEventRecord,
  PeriodicReviewRecord,
  PeriodicReviewTransaction,
  PeriodicReviewUnitOfWork,
} from "../../../packages/domain/periodic-reviews";
import { getPeriodicReviewOverview } from "./get-periodic-review-overview";
import {
  periodicCalendarWindow,
  periodicIdentity,
  PeriodicReviewsError,
} from "./periodic-reviews-validation";
import { submitPeriodicReview } from "./submit-periodic-review";

class MemoryPeriodicReviews implements PeriodicReviewUnitOfWork {
  reviews: PeriodicReviewRecord[] = [];
  events: PeriodicReviewDomainEventRecord[] = [];

  async run<T>(_userId: string, work: (transaction: PeriodicReviewTransaction) => Promise<T>) {
    const snapshot = structuredClone({ reviews: this.reviews, events: this.events });
    try {
      return await work({
        findByRequestId: async (requestId, userId) =>
          this.reviews.find((review) => review.requestId === requestId && review.userId === userId),
        getCurrentForUpdate: async (userId, kind, periodStart) => this.reviews.find((review) =>
          review.userId === userId && review.kind === kind && review.periodStart === periodStart
          && review.status === "CURRENT"),
        supersede: async (reviewId, userId, endedAt) => {
          const review = this.reviews.find((value) => value.reviewId === reviewId && value.userId === userId);
          if (!review || review.status !== "CURRENT") throw new Error("conflict");
          review.status = "SUPERSEDED";
          review.endedAt = endedAt;
        },
        create: async (record) => { this.reviews.push(structuredClone(record)) },
        appendDomainEvent: async (event) => { this.events.push(structuredClone(event)) },
      });
    } catch (error) {
      this.reviews = snapshot.reviews;
      this.events = snapshot.events;
      throw error;
    }
  }
}

const baseCommand: SubmitPeriodicReviewCommand = {
  kind: "WEEK",
  periodStart: "2026-08-17",
  periodEnd: "2026-08-23",
  timeZone: "Asia/Kolkata",
  whatMattered: "Keeping direction visible while life stayed real.",
  whatChanged: "The return became smaller and more reliable.",
  whatMovedForward: "Two deliberate Sound Design experiments.",
  driftAndReturn: "Comparison appeared; I returned without replacing the plan.",
  whatWasLearned: "Short experiments make technique differences audible.",
  carryForward: "One small environmental-sound experiment.",
  worthPreserving: "Reliable return matters more than a clean week.",
  expectedCurrentReviewId: null,
};

function context(seed: string, receivedAt = "2026-08-23T18:00:00.000Z") {
  return {
    principal: { actorType: "USER" as const, userId: "user-a" },
    requestId: `web-idem-v1:periodic_review_submit:${seed.repeat(64).slice(0, 64)}`,
    source: "WEB_APP" as const,
    receivedAt,
  };
}

test("period identity requires a real Monday-Sunday week or exact calendar month", () => {
  assert.deepEqual(periodicIdentity(baseCommand), {
    kind: "WEEK",
    periodStart: "2026-08-17",
    periodEnd: "2026-08-23",
    timeZone: "Asia/Kolkata",
  });
  assert.deepEqual(periodicIdentity({
    kind: "MONTH",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    timeZone: "UTC",
  }), {
    kind: "MONTH",
    periodStart: "2026-02-01",
    periodEnd: "2026-02-28",
    timeZone: "UTC",
  });
  for (const value of [
    { ...baseCommand, periodStart: "2026-08-18" },
    { ...baseCommand, periodEnd: "2026-08-24" },
    { ...baseCommand, kind: "MONTH" as const },
  ]) assert.throws(() => periodicIdentity(value), (error: unknown) =>
    error instanceof PeriodicReviewsError && error.code === "INVALID_PERIOD");
});

test("calendar boundary must be exact local midnight across an offset time zone", () => {
  const identity = periodicIdentity(baseCommand);
  assert.deepEqual(periodicCalendarWindow(
    identity,
    "2026-08-16T18:30:00.000Z",
    "2026-08-23T18:30:00.000Z",
  ), {
    from: "2026-08-16T18:30:00.000Z",
    to: "2026-08-23T18:30:00.000Z",
  });
  assert.throws(() => periodicCalendarWindow(
    identity,
    "2026-08-17T00:00:00.000Z",
    "2026-08-24T00:00:00.000Z",
  ), (error: unknown) => error instanceof PeriodicReviewsError && error.code === "INVALID_PERIOD");
});

test("periodic review submission is versioned, idempotent, and event text stays content-free", async () => {
  const store = new MemoryPeriodicReviews();
  let id = 0;
  const dependencies = {
    unitOfWork: store,
    clock: { now: () => "2026-08-23T18:00:01.000Z" },
    ids: { next: (prefix: "periodic-review" | "event") => `${prefix}-${++id}` },
  };
  const first = await submitPeriodicReview(baseCommand, context("a"), dependencies);
  const replay = await submitPeriodicReview(baseCommand, context("a"), dependencies);
  assert.equal(first.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.reviewId, first.reviewId);
  assert.equal(store.reviews.length, 1);
  assert.equal(store.events.length, 1);
  assert.deepEqual(Object.keys(store.events[0]!.payloadJson).sort(), [
    "authorityClass", "kind", "periodEnd", "periodStart", "timeZone",
  ]);

  const revised = await submitPeriodicReview({
    ...baseCommand,
    carryForward: "Repeat the small experiment before expanding it.",
    expectedCurrentReviewId: first.reviewId,
  }, context("b", "2026-08-23T18:10:00.000Z"), {
    ...dependencies,
    clock: { now: () => "2026-08-23T18:10:01.000Z" },
  });
  assert.equal(revised.supersededReviewId, first.reviewId);
  assert.equal(store.reviews[0]!.status, "SUPERSEDED");
  assert.equal(store.reviews[1]!.status, "CURRENT");
  assert.equal(store.events[1]!.eventType, "PERIODIC_REVIEW_REVISED");
});

test("periodic review rejects stale revisions and mismatched idempotent replays", async () => {
  const store = new MemoryPeriodicReviews();
  const dependencies = {
    unitOfWork: store,
    clock: { now: () => "2026-08-23T18:00:01.000Z" },
    ids: { next: (prefix: "periodic-review" | "event") => `${prefix}-one` },
  };
  await submitPeriodicReview(baseCommand, context("c"), dependencies);
  await assert.rejects(
    submitPeriodicReview({ ...baseCommand, carryForward: "Different" }, context("c"), dependencies),
    (error: unknown) => error instanceof PeriodicReviewsError && error.code === "IDEMPOTENCY_CONFLICT",
  );
  await assert.rejects(
    submitPeriodicReview({ ...baseCommand, carryForward: "Different" }, context("d"), dependencies),
    (error: unknown) => error instanceof PeriodicReviewsError && error.code === "CURRENT_REVIEW_CHANGED",
  );
});

test("overview preserves source authority and includes weekly reflection inside a month", async () => {
  const overview = await getPeriodicReviewOverview({
    kind: "MONTH",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    timeZone: "UTC",
    calendarFrom: "2026-08-01T00:00:00.000Z",
    calendarTo: "2026-09-01T00:00:00.000Z",
  }, { actorType: "USER", userId: "user-a" }, {
    periodicReviewReader: {
      listReviews: async () => [],
      listCurrentInRange: async () => [{
        reviewId: "weekly-1", userId: "user-a", kind: "WEEK",
        periodStart: "2026-08-17", periodEnd: "2026-08-23", timeZone: "UTC",
        whatMattered: "Direction stayed visible.", whatChanged: "Return got smaller.",
        whatMovedForward: "Practice happened.", driftAndReturn: "Returned once.",
        whatWasLearned: "Small is useful.", carryForward: "Repeat once.",
        worthPreserving: null, status: "CURRENT", submittedAt: "2026-08-23T18:00:00.000Z",
        recordedAt: "2026-08-23T18:00:01.000Z", endedAt: null,
      }],
    },
    dailyReturnReader: {
      listLogEntriesForDate: async (_userId, date) => date === "2026-08-19" ? [{
        entryId: "log-1", userId: "user-a", localDate: date, timeZone: "UTC",
        body: "Compared plans, then returned.", occurredAt: "2026-08-19T12:00:00.000Z",
        recordedAt: "2026-08-19T12:00:01.000Z",
      }] : [],
      listReviewsForDate: async () => [],
    },
    calendarReader: { listOverlapping: async () => [{
      id: "calendar-1", userId: "user-a", title: "Software work",
      startsAt: "2026-08-19T04:00:00.000Z", endsAt: "2026-08-19T12:00:00.000Z",
      category: "Work", commitment: "Fixed", createdAt: "2026-08-01T00:00:00.000Z",
      sourceProposalId: "proposal-1",
    }] },
    journeyPracticeReader: { getSnapshot: async () => ({ sessions: [] }) },
    driftReader: { listCurrent: async () => [] },
    brainDumpNotNowReader: {
      listBrainDumpItems: async () => [],
      listNotNowItems: async () => [],
    },
  });
  assert.equal(overview.sourceCounts.dailyLogEntries, 1);
  assert.equal(overview.sourceCounts.calendarEvents, 1);
  assert.equal(overview.sourceCounts.scheduledMinutes, 480);
  assert.equal(overview.sourceCounts.weeklyReviews, 1);
  assert.deepEqual(overview.sources.map((source) => source.authorityClass), [
    "FACT", "REFLECTION", "REFLECTION",
  ]);
  assert.equal(overview.sources.at(-1)?.domain, "WEEKLY_REVIEW");
});
