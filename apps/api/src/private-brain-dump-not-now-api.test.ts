import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import type {
  BrainDumpCaptureRecord,
  BrainDumpClassificationRecord,
  BrainDumpNotNowDomainEventRecord,
  BrainDumpNotNowTransaction,
  BrainDumpNotNowUnitOfWork,
  NotNowItemRecord,
} from "../../../packages/domain/brain-dump-not-now";
import type {
  BrainDumpNotNowReader,
  BrainDumpReadRecord,
  NotNowReadRecord,
} from "../../../packages/domain/brain-dump-not-now-read";
import { handlePrivateBrainDumpNotNowRequest } from "./private-brain-dump-not-now-api";

class MemoryStore implements BrainDumpNotNowUnitOfWork, BrainDumpNotNowReader {
  readonly captures: BrainDumpCaptureRecord[] = [{
    captureId: "capture-1",
    userId: "user-a",
    rawText: "Maybe a new idea needs a safe place before it becomes a commitment.",
    source: "WEB_APP",
    receivedAt: "2026-08-18T19:59:00.000Z",
    recordedAt: "2026-08-18T19:59:01.000Z",
  }];
  readonly classifications: BrainDumpClassificationRecord[] = [];
  readonly notNowItems: NotNowItemRecord[] = [];
  readonly events: BrainDumpNotNowDomainEventRecord[] = [];

  async run<T>(authenticatedUserId: string, work: (transaction: BrainDumpNotNowTransaction) => Promise<T>) {
    return work({
      getCaptureForUpdate: async (captureId, userId) =>
        this.captures.find((record) => record.captureId === captureId && record.userId === userId),
      findClassificationByRequestId: async (requestId, userId) =>
        this.classifications.find((record) => record.requestId === requestId && record.userId === userId),
      getCurrentClassificationForUpdate: async (captureId, userId) =>
        this.classifications.find((record) =>
          record.captureId === captureId && record.userId === userId && record.status === "CURRENT"),
      supersedeCurrentClassification: async (classificationId, userId, endedAt) => {
        const record = this.classifications.find((candidate) =>
          candidate.classificationId === classificationId
          && candidate.userId === userId
          && candidate.status === "CURRENT");
        if (!record) throw new Error("missing classification");
        record.status = "SUPERSEDED";
        record.endedAt = endedAt;
      },
      createClassification: async (record) => {
        assert.equal(record.userId, authenticatedUserId);
        this.classifications.push(structuredClone(record));
      },
      findNotNowItemByRequestId: async (requestId, userId) =>
        this.notNowItems.find((record) => record.requestId === requestId && record.userId === userId),
      getCurrentNotNowItemForCapture: async (captureId, userId) =>
        this.notNowItems.find((record) =>
          record.captureId === captureId && record.userId === userId && record.status === "CURRENT"),
      getCurrentNotNowItemForUpdate: async (rootId, userId) =>
        this.notNowItems.find((record) =>
          record.rootId === rootId && record.userId === userId && record.status === "CURRENT"),
      supersedeCurrentNotNowItem: async (itemId, userId, endedAt) => {
        const record = this.notNowItems.find((candidate) =>
          candidate.itemId === itemId && candidate.userId === userId && candidate.status === "CURRENT");
        if (!record) throw new Error("missing item");
        record.status = "SUPERSEDED";
        record.endedAt = endedAt;
      },
      createNotNowItem: async (record) => {
        assert.equal(record.userId, authenticatedUserId);
        this.notNowItems.push(structuredClone(record));
      },
      appendDomainEvent: async (event) => {
        assert.equal(event.userId, authenticatedUserId);
        this.events.push(structuredClone(event));
      },
    });
  }

  async listBrainDumpItems(userId: string, limit: number): Promise<BrainDumpReadRecord[]> {
    return this.captures.filter((record) => record.userId === userId).slice(0, limit).map((record) => {
      const current = this.classifications.find((classification) =>
        classification.captureId === record.captureId
        && classification.userId === userId
        && classification.status === "CURRENT");
      return {
        captureId: record.captureId,
        userId,
        rawText: record.rawText,
        source: record.source,
        capturedAt: record.receivedAt,
        recordedAt: record.recordedAt,
        classificationId: current?.classificationId ?? null,
        category: current?.category ?? null,
        classificationStatus: current?.status ?? null,
        classificationConfirmedAt: current?.confirmedAt ?? null,
        classificationRecordedAt: current?.recordedAt ?? null,
      };
    });
  }

  async listNotNowItems(userId: string, limit: number): Promise<NotNowReadRecord[]> {
    return this.notNowItems.filter((record) =>
      record.userId === userId && record.status === "CURRENT").slice(0, limit).map((record) => {
      const capture = this.captures.find((candidate) => candidate.captureId === record.captureId)!;
      return {
        itemId: record.itemId,
        rootId: record.rootId,
        revision: record.revision,
        captureId: record.captureId,
        userId,
        rawText: capture.rawText,
        source: capture.source,
        assessment: record.assessment,
        posture: record.posture,
        state: record.state,
        reviewNote: record.reviewNote ?? null,
        decidedAt: record.decidedAt,
        recordedAt: record.recordedAt,
      };
    });
  }
}

async function withServer(
  work: (baseUrl: string, store: MemoryStore, telemetry: TechnicalTelemetryEvent[]) => Promise<void>,
) {
  const store = new MemoryStore();
  const telemetry: TechnicalTelemetryEvent[] = [];
  let id = 0;
  let timer = 100;
  const server = createServer((request, response) => {
    void handlePrivateBrainDumpNotNowRequest(request, response, {
      sessionVerifier: {
        async verify(token) {
          if (token === "owner-token") return { userId: "user-a" };
          if (token === "other-token") return { userId: "user-b" };
          return undefined;
        },
      },
      transportClock: { now: () => "2026-08-18T20:00:00.000Z" },
      requestIds: { next: () => `transport-${++id}` },
      brainDumpNotNowReader: store,
      brainDumpNotNowUnitOfWork: store,
      brainDumpNotNowClock: { now: () => "2026-08-18T20:00:01.000Z" },
      brainDumpNotNowIds: { next: (prefix) => `${prefix}-${++id}` },
      runtime: { environment: "ci", releaseSha: "brain-dump-api-test", platform: "CI" },
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

function headers(key?: string, token = "owner-token") {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...(key ? { "idempotency-key": key } : {}),
  };
}

test("private Brain Dump + NOT NOW routes classify, park, review, and isolate users", async () => {
  await withServer(async (baseUrl, store, telemetry) => {
    const initial = await fetch(`${baseUrl}/api/v1/brain-dump`, { headers: headers() });
    assert.equal(initial.status, 200);
    const initialBody = await initial.json() as { items: Array<{ rawText: string; currentClassification: null }> };
    assert.equal(initialBody.items[0]?.rawText, store.captures[0]?.rawText);
    assert.equal(initialBody.items[0]?.currentClassification, null);

    const classificationCommand = { category: "NOT_NOW", expectedCurrentClassificationId: null };
    const classification = await fetch(`${baseUrl}/api/v1/brain-dump/capture-1/classification`, {
      method: "POST",
      headers: headers("brain-dump-classify-api-0001"),
      body: JSON.stringify(classificationCommand),
    });
    assert.equal(classification.status, 200);
    const classificationBody = await classification.json() as { classificationId: string; status: string };
    assert.equal(classificationBody.status, "recorded");

    const replay = await fetch(`${baseUrl}/api/v1/brain-dump/capture-1/classification`, {
      method: "POST",
      headers: headers("brain-dump-classify-api-0001"),
      body: JSON.stringify(classificationCommand),
    });
    assert.equal((await replay.json() as { status: string }).status, "replayed");

    const parked = await fetch(`${baseUrl}/api/v1/not-now`, {
      method: "POST",
      headers: headers("not-now-park-api-key-0001"),
      body: JSON.stringify({
        captureId: "capture-1",
        classificationId: classificationBody.classificationId,
        assessment: "TEMPORARY_INSPIRATION",
        posture: "PARK_IT",
        expectedCurrentItemId: null,
      }),
    });
    const parkedBody = await parked.json() as { rootId: string; revision: number; state: string };
    assert.equal(parkedBody.state, "PARKED_NOT_NOW");

    const reviewed = await fetch(`${baseUrl}/api/v1/not-now/${parkedBody.rootId}/review`, {
      method: "POST",
      headers: headers("not-now-review-api-0001"),
      body: JSON.stringify({
        targetState: "RESEARCHING",
        expectedCurrentRevision: parkedBody.revision,
        reviewNote: "Research without changing Direction.",
      }),
    });
    assert.equal((await reviewed.json() as { revision: number }).revision, 2);

    const overview = await fetch(`${baseUrl}/api/v1/not-now`, { headers: headers() });
    const overviewBody = await overview.json() as { items: Array<{ state: string; rawText: string }> };
    assert.equal(overviewBody.items[0]?.state, "RESEARCHING");
    assert.equal(overviewBody.items[0]?.rawText, store.captures[0]?.rawText);

    const other = await fetch(`${baseUrl}/api/v1/brain-dump`, { headers: headers(undefined, "other-token") });
    assert.deepEqual(await other.json(), { items: [] });
    assert.equal(store.events.length, 3);
    assert.equal(JSON.stringify(telemetry).includes(store.captures[0]!.rawText), false);
    assert.deepEqual(telemetry.map((event) => event.kind === "OPERATION" ? event.operation : undefined), [
      "GET_BRAIN_DUMP_OVERVIEW",
      "CONFIRM_BRAIN_DUMP_CLASSIFICATION",
      "CONFIRM_BRAIN_DUMP_CLASSIFICATION",
      "PARK_NOT_NOW_ITEM",
      "REVIEW_NOT_NOW_ITEM",
      "GET_NOT_NOW_OVERVIEW",
      "GET_BRAIN_DUMP_OVERVIEW",
    ]);
  });
});

test("private Brain Dump + NOT NOW routes reject unauthenticated, malformed, and stale writes", async () => {
  await withServer(async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/v1/brain-dump`)).status, 401);
    const malformed = await fetch(`${baseUrl}/api/v1/not-now`, {
      method: "POST",
      headers: headers("not-now-malformed-api-0001"),
      body: JSON.stringify({ surprise: true }),
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { status: "invalid_request" });

    const missingKey = await fetch(`${baseUrl}/api/v1/brain-dump/capture-1/classification`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ category: "IDEA", expectedCurrentClassificationId: null }),
    });
    assert.equal(missingKey.status, 400);
    assert.deepEqual(await missingKey.json(), { status: "idempotency_required" });
  });
});
