import assert from "node:assert/strict";
import test from "node:test";
import {
  driftExplanations,
  driftReturnPostures,
} from "../../../packages/contracts/drift-return";
import type {
  DriftDecisionRecord,
  DriftDomainEventRecord,
  DriftOccurrenceRecord,
  DriftTransaction,
  DriftUnitOfWork,
} from "../../../packages/domain/drift-return";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { confirmDriftUnderstanding } from "./confirm-drift-understanding";
import { DriftError } from "./drift-return-validation";
import { recordDrift } from "./record-drift";
import { recordDriftReturn } from "./record-drift-return";
import { withWebWriteIdempotency, type WebWriteIdempotencyScope } from "./web-write-idempotency";

class MemoryDriftStore implements DriftUnitOfWork {
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
        const record = this.decisions.find((candidate) =>
          candidate.decisionId === decisionId
          && candidate.userId === userId
          && candidate.status === "CURRENT");
        if (!record) throw new Error("missing decision");
        record.status = "SUPERSEDED";
        record.endedAt = endedAt;
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
}

function requestContext(
  scope: WebWriteIdempotencyScope,
  key: string,
  userId = "user-a",
  receivedAt = "2026-08-18T20:00:00.000Z",
): WriteRequestContext {
  return withWebWriteIdempotency({
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt,
    requestId: `transport-${key}`,
  }, scope, key);
}

function fixture() {
  const store = new MemoryDriftStore();
  let id = 0;
  return {
    store,
    dependencies: {
      unitOfWork: store,
      clock: { now: () => "2026-08-18T20:00:01.000Z" },
      ids: { next: (prefix: "drift" | "drift-decision" | "event") => `${prefix}-${++id}` },
    },
  };
}

test("Drift V1 exposes only explicit explanations and return postures", () => {
  assert.deepEqual(driftExplanations, [
    "TEMPORARY_INSPIRATION",
    "COMPARISON",
    "AVOIDANCE",
    "EMOTIONAL_REACTION",
    "GENUINE_RECONSIDERATION",
    "UNSURE",
  ]);
  assert.deepEqual(driftReturnPostures, [
    "STILL_RETURNING",
    "RETURN_TO_DIRECTION",
    "PARK_IDEA",
    "REFLECT_ONLY",
    "ADJUST_PLAN",
    "DELIBERATE_RECONSIDERATION",
  ]);
});

test("recording preserves exact source, supports blank notes, replays safely, and emits no private text", async () => {
  const { store, dependencies } = fixture();
  const sourceNote = "  Comparison pulled me toward a different product.  ";
  const first = await recordDrift(
    { sourceNote },
    requestContext("DRIFT_RECORD", "drift-record-key-0001"),
    dependencies,
  );
  const replay = await recordDrift(
    { sourceNote },
    requestContext("DRIFT_RECORD", "drift-record-key-0001"),
    dependencies,
  );
  assert.equal(replay.idempotentReplay, true);
  assert.equal(store.occurrences[0]?.sourceNote, sourceNote);
  assert.equal(JSON.stringify(store.events).includes(sourceNote), false);
  assert.deepEqual(store.events[0]?.payloadJson, {
    lifecycleState: "RECORDED",
    authorityClass: "USER_SOURCE",
    hasSourceNote: true,
  });

  await recordDrift(
    {},
    requestContext("DRIFT_RECORD", "drift-record-key-0002", "user-a", "2026-08-18T20:01:00.000Z"),
    { ...dependencies, clock: { now: () => "2026-08-18T20:01:01.000Z" } },
  );
  assert.equal(store.occurrences[1]?.sourceNote, undefined);
});

test("understanding and return are preserved revisions with no cross-domain mutation", async () => {
  const { store, dependencies } = fixture();
  const occurrence = await recordDrift(
    { sourceNote: "I want to switch plans after seeing someone else's launch." },
    requestContext("DRIFT_RECORD", "drift-record-key-0003"),
    dependencies,
  );
  const understood = await confirmDriftUnderstanding(occurrence.driftId, {
    explanation: "COMPARISON",
    triggerNote: "Someone else's launch",
    emotionNote: "Behind",
    distractionNote: "A new product",
    expectedCurrentDecisionId: null,
  }, requestContext("DRIFT_UNDERSTAND", "drift-understand-0001", "user-a", "2026-08-18T20:01:00.000Z"), {
    ...dependencies,
    clock: { now: () => "2026-08-18T20:01:01.000Z" },
  });
  assert.equal(understood.lifecycleState, "UNDERSTOOD");

  const returning = await recordDriftReturn(occurrence.driftId, {
    returnPosture: "STILL_RETURNING",
    expectedCurrentRevision: 1,
  }, requestContext("DRIFT_RETURN", "drift-return-key-0001", "user-a", "2026-08-18T20:02:00.000Z"), {
    ...dependencies,
    clock: { now: () => "2026-08-18T20:02:01.000Z" },
  });
  assert.equal(returning.lifecycleState, "STILL_RETURNING");

  const revised = await confirmDriftUnderstanding(occurrence.driftId, {
    explanation: "TEMPORARY_INSPIRATION",
    expectedCurrentDecisionId: returning.decisionId,
  }, requestContext("DRIFT_UNDERSTAND", "drift-understand-0002", "user-a", "2026-08-18T20:03:00.000Z"), {
    ...dependencies,
    clock: { now: () => "2026-08-18T20:03:01.000Z" },
  });
  assert.equal(revised.lifecycleState, "STILL_RETURNING");
  assert.equal(revised.returnPosture, "STILL_RETURNING");

  const resolved = await recordDriftReturn(occurrence.driftId, {
    returnPosture: "RETURN_TO_DIRECTION",
    expectedCurrentRevision: revised.revision,
  }, requestContext("DRIFT_RETURN", "drift-return-key-0002", "user-a", "2026-08-18T20:04:00.000Z"), {
    ...dependencies,
    clock: { now: () => "2026-08-18T20:04:01.000Z" },
  });
  assert.equal(resolved.lifecycleState, "RESOLVED");
  assert.deepEqual(store.decisions.map((record) => record.status), ["SUPERSEDED", "SUPERSEDED", "SUPERSEDED", "CURRENT"]);
  assert.deepEqual(store.events.map((event) => event.eventType), [
    "DRIFT_RECORDED",
    "DRIFT_UNDERSTANDING_CONFIRMED",
    "DRIFT_RETURN_RECORDED",
    "DRIFT_UNDERSTANDING_CONFIRMED",
    "DRIFT_RESOLVED",
  ]);
  const serializedEvents = JSON.stringify(store.events);
  assert.equal(serializedEvents.includes("Someone else's launch"), false);
  assert.equal(serializedEvents.includes("A new product"), false);
  assert.equal(serializedEvents.includes("calendar"), false);
  assert.equal(serializedEvents.includes("journey"), false);
});

test("stale, unchanged, terminal, and foreign-user decisions fail closed", async () => {
  const { dependencies } = fixture();
  const occurrence = await recordDrift(
    {},
    requestContext("DRIFT_RECORD", "drift-record-key-0004"),
    dependencies,
  );

  await assert.rejects(
    confirmDriftUnderstanding(occurrence.driftId, {
      explanation: "UNSURE",
      expectedCurrentDecisionId: null,
    }, requestContext("DRIFT_UNDERSTAND", "drift-understand-foreign", "user-b"), dependencies),
    (error) => error instanceof DriftError && error.code === "DRIFT_NOT_FOUND",
  );

  const understood = await confirmDriftUnderstanding(occurrence.driftId, {
    explanation: "UNSURE",
    expectedCurrentDecisionId: null,
  }, requestContext("DRIFT_UNDERSTAND", "drift-understand-0003"), dependencies);

  await assert.rejects(
    confirmDriftUnderstanding(occurrence.driftId, {
      explanation: "UNSURE",
      expectedCurrentDecisionId: understood.decisionId,
    }, requestContext("DRIFT_UNDERSTAND", "drift-understand-0004"), dependencies),
    (error) => error instanceof DriftError && error.code === "DRIFT_DECISION_UNCHANGED",
  );

  const resolved = await recordDriftReturn(occurrence.driftId, {
    returnPosture: "REFLECT_ONLY",
    expectedCurrentRevision: 1,
  }, requestContext("DRIFT_RETURN", "drift-return-key-0003"), dependencies);

  await assert.rejects(
    recordDriftReturn(occurrence.driftId, {
      returnPosture: "RETURN_TO_DIRECTION",
      expectedCurrentRevision: resolved.revision,
    }, requestContext("DRIFT_RETURN", "drift-return-key-0004"), dependencies),
    (error) => error instanceof DriftError && error.code === "DRIFT_ALREADY_RESOLVED",
  );
});
