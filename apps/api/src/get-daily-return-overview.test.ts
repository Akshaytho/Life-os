import assert from "node:assert/strict";
import test from "node:test";
import type {
  DailyLogEntryReadRecord,
  DailyReturnReader,
  DailyReturnReviewReadRecord,
} from "../../../packages/domain/daily-return-read";
import {
  DailyReturnOverviewReadError,
  getDailyReturnOverview,
} from "./get-daily-return-overview";

function context(localDate = "2026-08-18", userId = "user-a") {
  return {
    principal: { actorType: "USER" as const, userId },
    localDate,
  };
}

function entry(
  entryId: string,
  overrides: Partial<DailyLogEntryReadRecord> = {},
): DailyLogEntryReadRecord {
  return {
    entryId,
    userId: "user-a",
    localDate: "2026-08-18",
    timeZone: "Asia/Kolkata",
    body: `Reflection ${entryId}`,
    occurredAt: "2026-08-18T18:00:00.000Z",
    recordedAt: "2026-08-18T18:00:01.000Z",
    ...overrides,
  };
}

function review(
  reviewId: string,
  status: DailyReturnReviewReadRecord["status"],
  overrides: Partial<DailyReturnReviewReadRecord> = {},
): DailyReturnReviewReadRecord {
  return {
    reviewId,
    userId: "user-a",
    localDate: "2026-08-18",
    timeZone: "Asia/Kolkata",
    whatHappened: "A real day happened.",
    whatMovedForward: "One small practice.",
    whatPulledMeAway: "Comparison.",
    returnToTomorrow: "One calm return.",
    returnState: "RETURNED",
    status,
    submittedAt: "2026-08-18T20:00:00.000Z",
    recordedAt: "2026-08-18T20:00:01.000Z",
    endedAt: status === "CURRENT" ? null : "2026-08-18T20:30:01.000Z",
    ...overrides,
  };
}

function reader(
  entries: DailyLogEntryReadRecord[],
  reviews: DailyReturnReviewReadRecord[],
  limits?: number[],
): DailyReturnReader {
  return {
    async listLogEntriesForDate(_userId, _localDate, limit) {
      limits?.push(limit);
      return entries;
    },
    async listReviewsForDate(_userId, _localDate, limit) {
      limits?.push(limit);
      return reviews;
    },
  };
}

test("projects chronological REFLECTION logs plus current and historical reviews", async () => {
  const limits: number[] = [];
  const overview = await getDailyReturnOverview(context(), {
    reader: reader(
      [
        entry("later", { occurredAt: "2026-08-18T19:00:00.000Z", recordedAt: "2026-08-18T19:00:01.000Z" }),
        entry("earlier", { occurredAt: "2026-08-18T18:00:00.000Z" }),
      ],
      [
        review("current", "CURRENT"),
        review("old", "SUPERSEDED", { submittedAt: "2026-08-18T19:30:00.000Z", recordedAt: "2026-08-18T19:30:01.000Z" }),
      ],
      limits,
    ),
  });

  assert.deepEqual(limits.sort((a, b) => a - b), [22, 201]);
  assert.equal(overview.logEntries[0]?.id, "earlier");
  assert.equal(overview.logEntries[0]?.authorityClass, "REFLECTION");
  assert.equal(overview.currentReview?.id, "current");
  assert.equal(overview.currentReview?.authorityClass, "REFLECTION");
  assert.equal(overview.reviewHistory[0]?.id, "old");
  assert.equal(JSON.stringify(overview).includes("requestFingerprint"), false);
  assert.equal(JSON.stringify(overview).includes("score"), false);
});

test("supports an explicit empty day", async () => {
  const overview = await getDailyReturnOverview(context(), {
    reader: reader([], []),
  });
  assert.deepEqual(overview, {
    localDate: "2026-08-18",
    logEntries: [],
    currentReview: null,
    reviewHistory: [],
  });
});

test("fails closed for cross-user, cross-date, and contradictory lifecycle records", async () => {
  const invalidCases = [
    { entries: [entry("other-user", { userId: "user-b" })], reviews: [] },
    { entries: [entry("other-day", { localDate: "2026-08-17" })], reviews: [] },
    { entries: [], reviews: [review("current-ended", "CURRENT", { endedAt: "2026-08-18T21:00:00.000Z" })] },
    { entries: [], reviews: [review("old-open", "SUPERSEDED", { endedAt: null })] },
    { entries: [], reviews: [review("invalid-return", "CURRENT", { returnState: "RETURNED", recordedAt: "not-a-time" })] },
  ];

  for (const item of invalidCases) {
    await assert.rejects(
      () => getDailyReturnOverview(context(), { reader: reader(item.entries, item.reviews) }),
      (error: unknown) =>
        error instanceof DailyReturnOverviewReadError
        && error.code === "DAILY_RETURN_STATE_INVALID",
    );
  }
});

test("fails closed instead of choosing between multiple current reviews", async () => {
  await assert.rejects(
    () => getDailyReturnOverview(context(), {
      reader: reader([], [review("a", "CURRENT"), review("b", "CURRENT")]),
    }),
    (error: unknown) =>
      error instanceof DailyReturnOverviewReadError
      && error.code === "DAILY_RETURN_STATE_INVALID",
  );
});

test("bounds logs and review history without silently truncating a day", async () => {
  const tooManyEntries = Array.from({ length: 201 }, (_, index) =>
    entry(`entry-${index}`, {
      occurredAt: new Date(Date.parse("2026-08-18T18:00:00.000Z") + index).toISOString(),
      recordedAt: new Date(Date.parse("2026-08-18T18:00:01.000Z") + index).toISOString(),
    }),
  );
  await assert.rejects(
    () => getDailyReturnOverview(context(), {
      reader: reader(tooManyEntries, []),
    }),
    (error: unknown) =>
      error instanceof DailyReturnOverviewReadError
      && error.code === "DAILY_RETURN_LIMIT_EXCEEDED",
  );
});

test("rejects invalid dates and principals before persistence", async () => {
  let called = false;
  const observed: DailyReturnReader = {
    async listLogEntriesForDate() {
      called = true;
      return [];
    },
    async listReviewsForDate() {
      called = true;
      return [];
    },
  };

  for (const invalid of [context("2026-02-30"), context("2026-08-18", "   ")]) {
    await assert.rejects(
      () => getDailyReturnOverview(invalid, { reader: observed }),
      (error: unknown) => error instanceof DailyReturnOverviewReadError,
    );
  }
  assert.equal(called, false);
});
