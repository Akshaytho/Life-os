import assert from "node:assert/strict";
import test from "node:test";
import type {
  DailyLogEntryRecord,
  DailyReturnDomainEventRecord,
  DailyReturnReviewRecord,
  DailyReturnTransaction,
  DailyReturnUnitOfWork,
} from "../../../packages/domain/daily-return";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { appendDailyLogEntry } from "./append-daily-log-entry";
import { DailyReturnError } from "./daily-return-validation";
import { submitDailyReturnReview } from "./submit-daily-return-review";
import { withWebWriteIdempotency } from "./web-write-idempotency";

class MemoryDailyReturnUnitOfWork implements DailyReturnUnitOfWork {
  readonly entries: DailyLogEntryRecord[] = [];
  readonly reviews: DailyReturnReviewRecord[] = [];
  readonly events: DailyReturnDomainEventRecord[] = [];
  runs = 0;

  async run<T>(
    authenticatedUserId: string,
    work: (transaction: DailyReturnTransaction) => Promise<T>,
  ): Promise<T> {
    this.runs += 1;
    const transaction: DailyReturnTransaction = {
      findLogEntryByRequestId: async (requestId, userId) =>
        this.entries.find((entry) => entry.requestId === requestId && entry.userId === userId),
      createLogEntry: async (record) => {
        assert.equal(record.userId, authenticatedUserId);
        this.entries.push(structuredClone(record));
      },
      findReviewByRequestId: async (requestId, userId) =>
        this.reviews.find((review) => review.requestId === requestId && review.userId === userId),
      getCurrentReviewForUpdate: async (userId, localDate) =>
        this.reviews.find(
          (review) =>
            review.userId === userId
            && review.localDate === localDate
            && review.status === "CURRENT",
        ),
      supersedeCurrentReview: async (reviewId, userId, endedAt) => {
        const review = this.reviews.find(
          (candidate) =>
            candidate.reviewId === reviewId
            && candidate.userId === userId
            && candidate.status === "CURRENT",
        );
        if (!review) throw new Error("missing current review");
        review.status = "SUPERSEDED";
        review.endedAt = endedAt;
      },
      createReview: async (record) => {
        assert.equal(record.userId, authenticatedUserId);
        this.reviews.push(structuredClone(record));
      },
      appendDomainEvent: async (event) => {
        assert.equal(event.userId, authenticatedUserId);
        this.events.push(structuredClone(event));
      },
    };
    return work(transaction);
  }
}

function rawContext(
  requestId: string,
  receivedAt = "2026-08-18T20:00:00.000Z",
): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId: "user-a" },
    source: "WEB_APP",
    receivedAt,
    requestId,
  };
}

function context(
  scope: "DAILY_LOG_APPEND" | "DAILY_RETURN_SUBMIT",
  key: string,
  receivedAt = "2026-08-18T20:00:00.000Z",
): WriteRequestContext {
  return withWebWriteIdempotency(rawContext("transport-request", receivedAt), scope, key);
}

function ids() {
  let entry = 0;
  let review = 0;
  let event = 0;
  return {
    next(prefix: "daily-log" | "daily-review" | "event") {
      if (prefix === "daily-log") return `daily-log-${++entry}`;
      if (prefix === "daily-review") return `daily-review-${++review}`;
      return `event-${++event}`;
    },
  };
}

function reviewCommand(expectedCurrentReviewId: string | null = null) {
  return {
    localDate: "2026-08-18",
    timeZone: "Asia/Kolkata",
    whatHappened: "Worked, trained, and listened carefully on the walk home.",
    whatMovedForward: "I practised noticing sound transitions.",
    whatPulledMeAway: "I compared my progress with finished creators.",
    returnToTomorrow: "One deliberate sound exercise after work.",
    returnState: "RETURNED" as const,
    expectedCurrentReviewId,
  };
}

test("appends the user's exact Daily Log reflection and one correlated domain event", async () => {
  const unitOfWork = new MemoryDailyReturnUnitOfWork();
  const receipt = await appendDailyLogEntry(
    {
      localDate: "2026-08-18",
      timeZone: "Asia/Kolkata",
      body: "  Work was heavy.\nI still noticed three clean sound transitions.  ",
      occurredAt: "2026-08-18T18:30:00.000Z",
    },
    context("DAILY_LOG_APPEND", "daily-log-retry-0001"),
    {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:00:01.000Z" },
      ids: ids(),
    },
  );

  assert.deepEqual(receipt, {
    entryId: "daily-log-1",
    localDate: "2026-08-18",
    authorityClass: "REFLECTION",
    occurredAt: "2026-08-18T18:30:00.000Z",
    recordedAt: "2026-08-18T20:00:01.000Z",
    idempotentReplay: false,
  });
  assert.equal(
    unitOfWork.entries[0]?.body,
    "Work was heavy.\nI still noticed three clean sound transitions.",
  );
  assert.equal(unitOfWork.events.length, 1);
  assert.equal(unitOfWork.events[0]?.eventType, "DAILY_LOG_ENTRY_RECORDED");
  assert.equal(unitOfWork.events[0]?.payloadJson.authorityClass, "REFLECTION");
  assert.equal(unitOfWork.events[0]?.correlationId.startsWith("web-idem-v1:daily_log_append:"), true);
});

test("Daily Log retries replay once and refuse changed content under the same key", async () => {
  const unitOfWork = new MemoryDailyReturnUnitOfWork();
  const dependencies = {
    unitOfWork,
    clock: { now: () => "2026-08-18T20:00:01.000Z" },
    ids: ids(),
  };
  const command = {
    localDate: "2026-08-18",
    timeZone: "Asia/Kolkata",
    body: "A short exact reflection.",
    occurredAt: "2026-08-18T19:00:00.000Z",
  };

  const first = await appendDailyLogEntry(
    command,
    context("DAILY_LOG_APPEND", "daily-log-idempotent-0001"),
    dependencies,
  );
  const replay = await appendDailyLogEntry(
    command,
    context("DAILY_LOG_APPEND", "daily-log-idempotent-0001", "2026-08-18T20:05:00.000Z"),
    dependencies,
  );

  assert.equal(replay.entryId, first.entryId);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(unitOfWork.entries.length, 1);
  assert.equal(unitOfWork.events.length, 1);

  await assert.rejects(
    () => appendDailyLogEntry(
      { ...command, body: "Different reflection." },
      context("DAILY_LOG_APPEND", "daily-log-idempotent-0001"),
      dependencies,
    ),
    (error: unknown) =>
      error instanceof DailyReturnError && error.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("Daily Log rejects impossible dates, unknown time zones, future occurrences, and untrusted request IDs", async () => {
  const valid = {
    localDate: "2026-08-18",
    timeZone: "Asia/Kolkata",
    body: "Synthetic reflection",
    occurredAt: "2026-08-18T19:00:00.000Z",
  };
  const cases = [
    { command: { ...valid, localDate: "2026-02-30" }, expected: "INVALID_DATE" },
    { command: { ...valid, timeZone: "Not/A_Real_Zone" }, expected: "INVALID_TIME_ZONE" },
    { command: { ...valid, occurredAt: "2026-08-18T21:00:00.000Z" }, expected: "INVALID_ENTRY" },
  ] as const;

  for (const item of cases) {
    const unitOfWork = new MemoryDailyReturnUnitOfWork();
    await assert.rejects(
      () => appendDailyLogEntry(
        item.command,
        context("DAILY_LOG_APPEND", "daily-log-invalid-0001"),
        {
          unitOfWork,
          clock: { now: () => "2026-08-18T20:00:01.000Z" },
          ids: ids(),
        },
      ),
      (error: unknown) =>
        error instanceof DailyReturnError && error.code === item.expected,
    );
    assert.equal(unitOfWork.entries.length, 0);
  }

  const unitOfWork = new MemoryDailyReturnUnitOfWork();
  await assert.rejects(
    () => appendDailyLogEntry(valid, rawContext("transport-only"), {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:00:01.000Z" },
      ids: ids(),
    }),
    (error: unknown) =>
      error instanceof DailyReturnError && error.code === "IDEMPOTENCY_REQUIRED",
  );
  assert.equal(unitOfWork.runs, 0);
});

test("submits the agreed return review as REFLECTION without a score", async () => {
  const unitOfWork = new MemoryDailyReturnUnitOfWork();
  const receipt = await submitDailyReturnReview(
    reviewCommand(),
    context("DAILY_RETURN_SUBMIT", "daily-return-review-0001"),
    {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:00:01.000Z" },
      ids: ids(),
    },
  );

  assert.equal(receipt.reviewId, "daily-review-1");
  assert.equal(receipt.authorityClass, "REFLECTION");
  assert.equal(receipt.status, "CURRENT");
  assert.equal(unitOfWork.reviews.length, 1);
  assert.equal(unitOfWork.events[0]?.eventType, "DAILY_RETURN_REVIEW_SUBMITTED");
  assert.equal(unitOfWork.events[0]?.payloadJson.authorityClass, "REFLECTION");
  const serialized = JSON.stringify(unitOfWork.reviews[0]);
  assert.equal(serialized.includes("score"), false);
  assert.equal(serialized.includes("percentage"), false);
});

test("revising a review preserves history and refuses stale current state", async () => {
  const unitOfWork = new MemoryDailyReturnUnitOfWork();
  const generator = ids();

  const first = await submitDailyReturnReview(
    reviewCommand(),
    context("DAILY_RETURN_SUBMIT", "daily-return-first-0001"),
    {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:00:01.000Z" },
      ids: generator,
    },
  );

  await assert.rejects(
    () => submitDailyReturnReview(
      { ...reviewCommand(null), returnToTomorrow: "A stale attempted revision." },
      context("DAILY_RETURN_SUBMIT", "daily-return-stale-0001", "2026-08-18T20:10:00.000Z"),
      {
        unitOfWork,
        clock: { now: () => "2026-08-18T20:10:01.000Z" },
        ids: generator,
      },
    ),
    (error: unknown) =>
      error instanceof DailyReturnError && error.code === "CURRENT_REVIEW_CHANGED",
  );

  const revised = await submitDailyReturnReview(
    {
      ...reviewCommand(first.reviewId),
      returnToTomorrow: "Return with one small sound exercise, then rest.",
      returnState: "STILL_RETURNING",
    },
    context("DAILY_RETURN_SUBMIT", "daily-return-revised-0001", "2026-08-18T20:20:00.000Z"),
    {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:20:01.000Z" },
      ids: generator,
    },
  );

  assert.equal(revised.supersededReviewId, first.reviewId);
  assert.equal(unitOfWork.reviews.length, 2);
  assert.equal(unitOfWork.reviews[0]?.status, "SUPERSEDED");
  assert.equal(unitOfWork.reviews[0]?.endedAt, "2026-08-18T20:20:01.000Z");
  assert.equal(unitOfWork.reviews[1]?.status, "CURRENT");
  assert.equal(unitOfWork.events[1]?.eventType, "DAILY_RETURN_REVIEW_REVISED");
});

test("review retries are replay-safe, including an older revision after supersession", async () => {
  const unitOfWork = new MemoryDailyReturnUnitOfWork();
  const generator = ids();
  const firstCommand = reviewCommand();
  const firstContext = context("DAILY_RETURN_SUBMIT", "daily-return-replay-0001");
  const dependencies = {
    unitOfWork,
    clock: { now: () => "2026-08-18T20:30:01.000Z" },
    ids: generator,
  };

  const first = await submitDailyReturnReview(firstCommand, firstContext, dependencies);
  const replay = await submitDailyReturnReview(firstCommand, firstContext, dependencies);
  assert.equal(replay.reviewId, first.reviewId);
  assert.equal(replay.idempotentReplay, true);

  await submitDailyReturnReview(
    { ...reviewCommand(first.reviewId), returnState: "NO_DRIFT_NOTICED" },
    context("DAILY_RETURN_SUBMIT", "daily-return-newer-0001", "2026-08-18T20:30:00.000Z"),
    dependencies,
  );

  const oldReplay = await submitDailyReturnReview(firstCommand, firstContext, dependencies);
  assert.equal(oldReplay.status, "SUPERSEDED");
  assert.equal(oldReplay.idempotentReplay, true);
  assert.equal(unitOfWork.reviews.length, 2);
  assert.equal(unitOfWork.events.length, 2);
});

test("review validation fails closed for blank answers and invalid return state", async () => {
  for (const command of [
    { ...reviewCommand(), whatPulledMeAway: "   " },
    { ...reviewCommand(), returnState: "GRADED_SUCCESS" as never },
  ]) {
    const unitOfWork = new MemoryDailyReturnUnitOfWork();
    await assert.rejects(
      () => submitDailyReturnReview(
        command,
        context("DAILY_RETURN_SUBMIT", "daily-return-invalid-0001"),
        {
          unitOfWork,
          clock: { now: () => "2026-08-18T20:00:01.000Z" },
          ids: ids(),
        },
      ),
      (error: unknown) => error instanceof DailyReturnError,
    );
    assert.equal(unitOfWork.reviews.length, 0);
    assert.equal(unitOfWork.events.length, 0);
  }
});
