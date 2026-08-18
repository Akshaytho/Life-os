import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import type {
  DailyLogEntryRecord,
  DailyReturnDomainEventRecord,
  DailyReturnReviewRecord,
  DailyReturnTransaction,
  DailyReturnUnitOfWork,
} from "../../../packages/domain/daily-return";
import type { DailyReturnReader } from "../../../packages/domain/daily-return-read";
import { handlePrivateDailyReturnRequest } from "./private-daily-return-api";

class MemoryDailyReturnStore implements DailyReturnUnitOfWork, DailyReturnReader {
  readonly entries: DailyLogEntryRecord[] = [];
  readonly reviews: DailyReturnReviewRecord[] = [];
  readonly events: DailyReturnDomainEventRecord[] = [];

  async run<T>(
    authenticatedUserId: string,
    work: (transaction: DailyReturnTransaction) => Promise<T>,
  ): Promise<T> {
    return work({
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
        if (!review) throw new Error("missing review");
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
    });
  }

  async listLogEntriesForDate(userId: string, localDate: string, limit: number) {
    return this.entries
      .filter((entry) => entry.userId === userId && entry.localDate === localDate)
      .slice(0, limit)
      .map((entry) => ({
        entryId: entry.entryId,
        userId: entry.userId,
        localDate: entry.localDate,
        timeZone: entry.timeZone,
        body: entry.body,
        occurredAt: entry.occurredAt,
        recordedAt: entry.recordedAt,
      }));
  }

  async listReviewsForDate(userId: string, localDate: string, limit: number) {
    return this.reviews
      .filter((review) => review.userId === userId && review.localDate === localDate)
      .slice(0, limit)
      .map((review) => ({
        reviewId: review.reviewId,
        userId: review.userId,
        localDate: review.localDate,
        timeZone: review.timeZone,
        whatHappened: review.whatHappened,
        whatMovedForward: review.whatMovedForward,
        whatPulledMeAway: review.whatPulledMeAway,
        returnToTomorrow: review.returnToTomorrow,
        returnState: review.returnState,
        status: review.status,
        submittedAt: review.submittedAt,
        recordedAt: review.recordedAt,
        endedAt: review.endedAt ?? null,
      }));
  }
}

async function withServer(
  work: (baseUrl: string, store: MemoryDailyReturnStore, telemetry: TechnicalTelemetryEvent[]) => Promise<void>,
) {
  const store = new MemoryDailyReturnStore();
  const telemetry: TechnicalTelemetryEvent[] = [];
  let id = 0;
  let timer = 100;
  const server = createServer((request, response) => {
    void handlePrivateDailyReturnRequest(request, response, {
      sessionVerifier: {
        async verify(token) {
          if (token === "owner-token") return { userId: "user-a" };
          if (token === "other-token") return { userId: "user-b" };
          return undefined;
        },
      },
      transportClock: { now: () => "2026-08-18T20:00:00.000Z" },
      requestIds: { next: () => `transport-${++id}` },
      dailyReturnReader: store,
      dailyReturnUnitOfWork: store,
      dailyReturnClock: { now: () => "2026-08-18T20:00:01.000Z" },
      dailyReturnIds: {
        next(prefix) {
          return `${prefix}-${++id}`;
        },
      },
      runtime: {
        environment: "ci",
        releaseSha: "daily-return-api-test",
        platform: "CI",
      },
      telemetry: { emit(event) { telemetry.push(event); } },
      operationTimer: {
        nowMs: () => ++timer,
        nowIso: () => "2026-08-18T20:00:02.000Z",
      },
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await work(`http://127.0.0.1:${address.port}`, store, telemetry);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function auth(token = "owner-token") {
  return { authorization: `Bearer ${token}` };
}

test("private Daily Return transport records, replays, reads and user-isolates reflections", async () => {
  await withServer(async (baseUrl, store, telemetry) => {
    const empty = await fetch(
      `${baseUrl}/api/v1/daily-return?date=2026-08-18`,
      { headers: auth() },
    );
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), {
      localDate: "2026-08-18",
      logEntries: [],
      currentReview: null,
      reviewHistory: [],
    });

    const logCommand = {
      localDate: "2026-08-18",
      timeZone: "Asia/Kolkata",
      body: "A private exact reflection.",
      occurredAt: "2026-08-18T19:00:00.000Z",
    };
    const log = await fetch(`${baseUrl}/api/v1/daily-return/logs`, {
      method: "POST",
      headers: {
        ...auth(),
        "content-type": "application/json",
        "idempotency-key": "daily-log-api-key-0001",
      },
      body: JSON.stringify(logCommand),
    });
    assert.equal(log.status, 200);
    assert.equal((await log.json() as Record<string, unknown>).status, "recorded");

    const replay = await fetch(`${baseUrl}/api/v1/daily-return/logs`, {
      method: "POST",
      headers: {
        ...auth(),
        "content-type": "application/json",
        "idempotency-key": "daily-log-api-key-0001",
      },
      body: JSON.stringify(logCommand),
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as Record<string, unknown>).status, "replayed");
    assert.equal(store.entries.length, 1);

    const reviewCommand = {
      localDate: "2026-08-18",
      timeZone: "Asia/Kolkata",
      whatHappened: "A real day happened.",
      whatMovedForward: "One deliberate practice.",
      whatPulledMeAway: "Comparison.",
      returnToTomorrow: "One calm return.",
      returnState: "RETURNED",
      expectedCurrentReviewId: null,
    };
    const review = await fetch(`${baseUrl}/api/v1/daily-return/review`, {
      method: "POST",
      headers: {
        ...auth(),
        "content-type": "application/json",
        "idempotency-key": "daily-return-api-key-0001",
      },
      body: JSON.stringify(reviewCommand),
    });
    assert.equal(review.status, 200);
    assert.equal((await review.json() as Record<string, unknown>).status, "current");

    const owner = await fetch(
      `${baseUrl}/api/v1/daily-return?date=2026-08-18`,
      { headers: auth() },
    );
    const ownerBody = await owner.json() as {
      logEntries: Array<{ body: string; authorityClass: string }>;
      currentReview: { returnState: string; authorityClass: string } | null;
    };
    assert.equal(ownerBody.logEntries[0]?.body, logCommand.body);
    assert.equal(ownerBody.logEntries[0]?.authorityClass, "REFLECTION");
    assert.equal(ownerBody.currentReview?.returnState, "RETURNED");
    assert.equal(ownerBody.currentReview?.authorityClass, "REFLECTION");

    const other = await fetch(
      `${baseUrl}/api/v1/daily-return?date=2026-08-18`,
      { headers: auth("other-token") },
    );
    assert.deepEqual(await other.json(), {
      localDate: "2026-08-18",
      logEntries: [],
      currentReview: null,
      reviewHistory: [],
    });

    assert.equal(store.events.length, 2);
    assert.deepEqual(
      telemetry.map((event) => event.kind === "OPERATION" ? event.operation : undefined),
      [
        "GET_DAILY_RETURN_OVERVIEW",
        "APPEND_DAILY_LOG_ENTRY",
        "APPEND_DAILY_LOG_ENTRY",
        "SUBMIT_DAILY_RETURN_REVIEW",
        "GET_DAILY_RETURN_OVERVIEW",
        "GET_DAILY_RETURN_OVERVIEW",
      ],
    );
    assert.equal(JSON.stringify(telemetry).includes(logCommand.body), false);
    assert.equal(JSON.stringify(telemetry).includes(reviewCommand.whatHappened), false);
  });
});

test("private Daily Return transport rejects malformed and conflicting requests safely", async () => {
  await withServer(async (baseUrl) => {
    const unauthenticated = await fetch(
      `${baseUrl}/api/v1/daily-return?date=2026-08-18`,
    );
    assert.equal(unauthenticated.status, 401);

    const invalidQuery = await fetch(
      `${baseUrl}/api/v1/daily-return?date=2026-08-18&extra=true`,
      { headers: auth() },
    );
    assert.equal(invalidQuery.status, 400);

    const invalidBody = await fetch(`${baseUrl}/api/v1/daily-return/logs`, {
      method: "POST",
      headers: {
        ...auth(),
        "content-type": "application/json",
        "idempotency-key": "daily-log-invalid-key-0001",
      },
      body: JSON.stringify({
        localDate: "2026-08-18",
        timeZone: "Asia/Kolkata",
        body: "Reflection",
        occurredAt: "2026-08-18T19:00:00.000Z",
        surprise: "must be rejected",
      }),
    });
    assert.equal(invalidBody.status, 400);
    assert.deepEqual(await invalidBody.json(), { status: "invalid_request" });

    const missingKey = await fetch(`${baseUrl}/api/v1/daily-return/review`, {
      method: "POST",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missingKey.status, 400);
  });
});
