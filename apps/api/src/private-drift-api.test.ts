import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import type {
  DriftDecisionRecord,
  DriftDomainEventRecord,
  DriftOccurrenceRecord,
  DriftTransaction,
  DriftUnitOfWork,
} from "../../../packages/domain/drift-return";
import type { DriftOccurrenceWithDecisions, DriftReader } from "../../../packages/domain/drift-return-read";
import { handlePrivateDriftRequest } from "./private-drift-api";

class MemoryStore implements DriftUnitOfWork, DriftReader {
  readonly occurrences: DriftOccurrenceRecord[] = [];
  readonly decisions: DriftDecisionRecord[] = [];
  readonly events: DriftDomainEventRecord[] = [];

  async run<T>(authenticatedUserId: string, work: (transaction: DriftTransaction) => Promise<T>) {
    return work({
      findOccurrenceByRequestId: async (requestId, userId) =>
        this.occurrences.find((record) => record.requestId === requestId && record.userId === userId),
      getOccurrenceForUpdate: async (driftId, userId) =>
        this.occurrences.find((record) => record.driftId === driftId && record.userId === userId),
      createOccurrence: async (record) => {
        assert.equal(record.userId, authenticatedUserId);
        this.occurrences.push(structuredClone(record));
      },
      findDecisionByRequestId: async (requestId, userId) =>
        this.decisions.find((record) => record.requestId === requestId && record.userId === userId),
      getCurrentDecisionForUpdate: async (driftId, userId) =>
        this.decisions.find((record) =>
          record.driftId === driftId && record.userId === userId && record.status === "CURRENT"),
      supersedeCurrentDecision: async (decisionId, userId, endedAt) => {
        const current = this.decisions.find((record) =>
          record.decisionId === decisionId && record.userId === userId && record.status === "CURRENT");
        if (!current) throw new Error("missing decision");
        current.status = "SUPERSEDED";
        current.endedAt = endedAt;
      },
      createDecision: async (record) => {
        assert.equal(record.userId, authenticatedUserId);
        this.decisions.push(structuredClone(record));
      },
      appendDomainEvent: async (event) => {
        assert.equal(event.userId, authenticatedUserId);
        this.events.push(structuredClone(event));
      },
    });
  }

  async listCurrent(userId: string, limit: number): Promise<DriftOccurrenceWithDecisions[]> {
    return this.occurrences.filter((record) => record.userId === userId).slice(0, limit).map((occurrence) => ({
      occurrence: structuredClone(occurrence),
      decisions: this.decisions.filter((decision) =>
        decision.userId === userId && decision.driftId === occurrence.driftId).map((decision) => structuredClone(decision)),
    }));
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
    void handlePrivateDriftRequest(request, response, {
      sessionVerifier: {
        async verify(token) {
          if (token === "owner-token") return { userId: "user-a" };
          if (token === "other-token") return { userId: "user-b" };
          return undefined;
        },
      },
      transportClock: { now: () => "2026-08-18T20:00:00.000Z" },
      requestIds: { next: () => `transport-${++id}` },
      driftReader: store,
      driftUnitOfWork: store,
      driftClock: { now: () => "2026-08-18T20:00:01.000Z" },
      driftIds: { next: (prefix) => `${prefix}-${++id}` },
      runtime: { environment: "ci", releaseSha: "drift-api-test", platform: "CI" },
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

test("private Drift routes record, understand, resolve, replay, and isolate users", async () => {
  await withServer(async (baseUrl, store, telemetry) => {
    const initial = await fetch(`${baseUrl}/api/v1/drifts`, { headers: headers() });
    assert.equal(initial.status, 200);
    assert.deepEqual(await initial.json(), { items: [] });

    const sourceNote = "Comparison pulled me toward a different plan.";
    const recordCommand = { sourceNote };
    const recorded = await fetch(`${baseUrl}/api/v1/drifts`, {
      method: "POST",
      headers: headers("drift-record-api-key-0001"),
      body: JSON.stringify(recordCommand),
    });
    assert.equal(recorded.status, 200);
    const recordedBody = await recorded.json() as { driftId: string; status: string };
    assert.equal(recordedBody.status, "recorded");

    const replay = await fetch(`${baseUrl}/api/v1/drifts`, {
      method: "POST",
      headers: headers("drift-record-api-key-0001"),
      body: JSON.stringify(recordCommand),
    });
    assert.equal((await replay.json() as { status: string }).status, "replayed");

    const understood = await fetch(`${baseUrl}/api/v1/drifts/${recordedBody.driftId}/understanding`, {
      method: "POST",
      headers: headers("drift-understand-api-0001"),
      body: JSON.stringify({
        explanation: "COMPARISON",
        triggerNote: "A launch announcement",
        emotionNote: "Behind",
        distractionNote: "Another product",
        expectedCurrentDecisionId: null,
      }),
    });
    assert.equal(understood.status, 200);
    const understoodBody = await understood.json() as { revision: number; status: string; decisionStatus: string };
    assert.equal(understoodBody.status, "recorded");
    assert.equal(understoodBody.decisionStatus, "CURRENT");

    const resolved = await fetch(`${baseUrl}/api/v1/drifts/${recordedBody.driftId}/return`, {
      method: "POST",
      headers: headers("drift-return-api-key-0001"),
      body: JSON.stringify({
        returnPosture: "RETURN_TO_DIRECTION",
        expectedCurrentRevision: understoodBody.revision,
      }),
    });
    assert.equal(resolved.status, 200);
    assert.equal((await resolved.json() as { lifecycleState: string }).lifecycleState, "RESOLVED");

    const overview = await fetch(`${baseUrl}/api/v1/drifts`, { headers: headers() });
    const overviewBody = await overview.json() as {
      items: Array<{ sourceNote: string; lifecycleState: string; decisionHistory: unknown[] }>;
    };
    assert.equal(overviewBody.items[0]?.sourceNote, sourceNote);
    assert.equal(overviewBody.items[0]?.lifecycleState, "RESOLVED");
    assert.equal(overviewBody.items[0]?.decisionHistory.length, 2);

    const other = await fetch(`${baseUrl}/api/v1/drifts`, { headers: headers(undefined, "other-token") });
    assert.deepEqual(await other.json(), { items: [] });
    assert.equal(store.events.length, 3);
    assert.equal(JSON.stringify(telemetry).includes(sourceNote), false);
    assert.equal(JSON.stringify(telemetry).includes("A launch announcement"), false);
    assert.deepEqual(telemetry.map((event) => event.kind === "OPERATION" ? event.operation : undefined), [
      "GET_DRIFT_OVERVIEW",
      "RECORD_DRIFT",
      "RECORD_DRIFT",
      "CONFIRM_DRIFT_UNDERSTANDING",
      "RECORD_DRIFT_RETURN",
      "GET_DRIFT_OVERVIEW",
      "GET_DRIFT_OVERVIEW",
    ]);
  });
});

test("private Drift routes reject unauthenticated, malformed, missing-key, and foreign writes", async () => {
  await withServer(async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/v1/drifts`)).status, 401);

    const malformed = await fetch(`${baseUrl}/api/v1/drifts`, {
      method: "POST",
      headers: headers("drift-malformed-api-0001"),
      body: JSON.stringify({ surprise: true }),
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { status: "invalid_request" });

    const missingKey = await fetch(`${baseUrl}/api/v1/drifts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({}),
    });
    assert.equal(missingKey.status, 400);
    assert.deepEqual(await missingKey.json(), { status: "idempotency_required" });

    const foreign = await fetch(`${baseUrl}/api/v1/drifts/missing/understanding`, {
      method: "POST",
      headers: headers("drift-foreign-api-key-0001", "other-token"),
      body: JSON.stringify({ explanation: "UNSURE", expectedCurrentDecisionId: null }),
    });
    assert.equal(foreign.status, 404);
    assert.deepEqual(await foreign.json(), { status: "not_found" });
  });
});
