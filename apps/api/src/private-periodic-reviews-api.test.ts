import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type {
  PeriodicReviewDomainEventRecord,
  PeriodicReviewRecord,
  PeriodicReviewTransaction,
} from "../../../packages/domain/periodic-reviews";
import { handlePrivatePeriodicReviewsRequest } from "./private-periodic-reviews-api";

function dependencies() {
  const reviews: PeriodicReviewRecord[] = [];
  const events: PeriodicReviewDomainEventRecord[] = [];
  let id = 0;
  return {
    reviews,
    events,
    value: {
      sessionVerifier: { async verify(token: string) { return token === "valid-token" ? { userId: "user-a" } : undefined } },
      transportClock: { now: () => "2026-08-23T18:00:00.000Z" },
      requestIds: { next: () => "transport-request-1" },
      periodicReviewReader: {
        listReviews: async () => [],
        listCurrentInRange: async () => [],
      },
      dailyReturnReader: {
        listLogEntriesForDate: async () => [],
        listReviewsForDate: async () => [],
      },
      canonicalCalendarReader: { listOverlapping: async () => [] },
      journeyPracticeReader: { getSnapshot: async () => ({ sessions: [] }) },
      driftReader: { listCurrent: async () => [] },
      brainDumpNotNowReader: { listBrainDumpItems: async () => [], listNotNowItems: async () => [] },
      periodicReviewUnitOfWork: {
        async run<T>(_userId: string, work: (transaction: PeriodicReviewTransaction) => Promise<T>) {
          return work({
            findByRequestId: async (requestId, userId) => reviews.find((review) => review.requestId === requestId && review.userId === userId),
            getCurrentForUpdate: async () => undefined,
            supersede: async () => undefined,
            create: async (record) => { reviews.push(record) },
            appendDomainEvent: async (event) => { events.push(event) },
          });
        },
      },
      periodicReviewClock: { now: () => "2026-08-23T18:00:01.000Z" },
      periodicReviewIds: { next: (prefix: "periodic-review" | "event") => `${prefix}-${++id}` },
      runtime: { environment: "ci" as const, releaseSha: "periodic-api", platform: "CI" as const },
      telemetry: { emit() {} },
      operationTimer: { nowMs: () => 1, nowIso: () => "2026-08-23T18:00:01.000Z" },
    },
  };
}

async function withServer(work: (baseUrl: string, state: ReturnType<typeof dependencies>) => Promise<void>) {
  const state = dependencies();
  const server = createServer((request, response) => {
    void handlePrivatePeriodicReviewsRequest(request, response, state.value);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try { await work(`http://127.0.0.1:${address.port}`, state) }
  finally { server.close(); await once(server, "close") }
}

test("GET returns an authenticated empty week without invented activity", async () => {
  await withServer(async (baseUrl) => {
    const params = new URLSearchParams({
      kind: "WEEK", periodStart: "2026-08-17", periodEnd: "2026-08-23",
      timeZone: "Asia/Kolkata", calendarFrom: "2026-08-16T18:30:00.000Z",
      calendarTo: "2026-08-23T18:30:00.000Z",
    });
    const response = await fetch(`${baseUrl}/api/v1/reviews/period?${params}`, {
      headers: { authorization: "Bearer valid-token" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.kind, "WEEK");
    assert.equal(body.currentReview, null);
    assert.deepEqual(body.sources, []);
    assert.equal(body.sourceCounts.calendarEvents, 0);
  });
});

test("PUT authenticates, requires idempotency, and records one content-free event", async () => {
  await withServer(async (baseUrl, state) => {
    const command = {
      kind: "WEEK", periodStart: "2026-08-17", periodEnd: "2026-08-23", timeZone: "Asia/Kolkata",
      whatMattered: "Direction stayed visible.", whatChanged: "Return got smaller.",
      whatMovedForward: "Two Sound Design practices.", driftAndReturn: "I returned after comparison.",
      whatWasLearned: "Short comparisons were useful.", carryForward: "Repeat one comparison.",
      expectedCurrentReviewId: null,
    };
    const missingKey = await fetch(`${baseUrl}/api/v1/reviews/period`, {
      method: "PUT", headers: { authorization: "Bearer valid-token", "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    assert.equal(missingKey.status, 400);
    assert.deepEqual(await missingKey.json(), { status: "idempotency_required" });

    const response = await fetch(`${baseUrl}/api/v1/reviews/period`, {
      method: "PUT",
      headers: {
        authorization: "Bearer valid-token", "content-type": "application/json",
        "idempotency-key": "periodic-review-key-0001",
      },
      body: JSON.stringify(command),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "recorded");
    assert.equal(state.reviews.length, 1);
    assert.equal(state.events.length, 1);
    assert.deepEqual(Object.keys(state.events[0]!.payloadJson).sort(), [
      "authorityClass", "kind", "periodEnd", "periodStart", "timeZone",
    ]);
  });
});

test("unknown query keys and unauthenticated reads fail closed", async () => {
  await withServer(async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/api/v1/reviews/period`);
    assert.equal(unauthenticated.status, 401);
    const invalid = await fetch(`${baseUrl}/api/v1/reviews/period?unexpected=1`, {
      headers: { authorization: "Bearer valid-token" },
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { status: "invalid_request" });
  });
});
