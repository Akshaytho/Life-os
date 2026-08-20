import assert from "node:assert/strict";
import test from "node:test";
import type { RetainMemoryItemCommand } from "../../../packages/contracts/memory";
import type {
  MemoryCandidateRecord,
  MemoryDomainEventRecord,
  MemoryItemRecord,
  MemoryTransaction,
  MemoryUnitOfWork,
} from "../../../packages/domain/memory";
import { getMemoryOverview } from "./get-memory-overview";
import { MemoryError } from "./memory-validation";
import { retainMemoryItem } from "./retain-memory-item";
import { reviseMemoryItem } from "./revise-memory-item";

class MemoryStore implements MemoryUnitOfWork {
  items: MemoryItemRecord[] = [];
  events: MemoryDomainEventRecord[] = [];
  candidates: MemoryCandidateRecord[] = [{
    userId: "user-a", sourceDomain: "JOURNEY_PRACTICE", sourceEntityId: "completion-1",
    sourceLabel: "Journey practice · ENVIRONMENTAL SOUND",
    sourceBody: "Short comparisons make layers easier to hear.",
    sourceOccurredAt: "2026-08-20T14:00:00.000Z",
  }];

  async run<T>(_userId: string, work: (transaction: MemoryTransaction) => Promise<T>) {
    const snapshot = structuredClone({ items: this.items, events: this.events });
    try {
      return await work({
        findByRequestId: async (requestId, userId) => this.items.find((item) => item.requestId === requestId && item.userId === userId),
        getCandidateForUpdate: async (userId, sourceDomain, sourceEntityId) => this.candidates.find((candidate) => candidate.userId === userId && candidate.sourceDomain === sourceDomain && candidate.sourceEntityId === sourceEntityId),
        getCurrentBySourceForUpdate: async (userId, sourceDomain, sourceEntityId) => this.items.find((item) => item.userId === userId && item.sourceDomain === sourceDomain && item.sourceEntityId === sourceEntityId && item.status === "CURRENT"),
        getCurrentByRootForUpdate: async (userId, rootId) => this.items.find((item) => item.userId === userId && item.rootId === rootId && item.status === "CURRENT"),
        supersede: async (itemId, userId, endedAt) => {
          const item = this.items.find((value) => value.itemId === itemId && value.userId === userId);
          if (!item || item.status !== "CURRENT") throw new Error("conflict");
          item.status = "SUPERSEDED"; item.endedAt = endedAt;
        },
        create: async (record) => { this.items.push(structuredClone(record)) },
        appendDomainEvent: async (event) => { this.events.push(structuredClone(event)) },
      });
    } catch (error) {
      this.items = snapshot.items; this.events = snapshot.events; throw error;
    }
  }
}

const command: RetainMemoryItemCommand = {
  sourceDomain: "JOURNEY_PRACTICE", sourceEntityId: "completion-1",
  kind: "LEARNING", title: "Room tone reveals layers",
  body: "A short A/B comparison makes small layering differences easier to hear.",
  relationship: "NEW",
};

function context(operation: "retain" | "revise", seed: string, receivedAt = "2026-08-20T14:10:00.000Z") {
  return {
    principal: { actorType: "USER" as const, userId: "user-a" },
    requestId: `web-idem-v1:memory_${operation}:${seed.repeat(64).slice(0, 64)}`,
    source: "WEB_APP" as const,
    receivedAt,
  };
}

test("Memory overview validates authority inputs before the reader", async () => {
  let seen: unknown;
  const value = await getMemoryOverview({
    timeZone: "Asia/Kolkata", now: "2026-08-20T14:00:00Z", query: "  room tone  ", kind: "LEARNING",
  }, { actorType: "USER", userId: "user-a" }, {
    async getOverview(userId, read) {
      seen = { userId, read };
      return { ...read, trustedNow: [], candidates: [], items: [], timeCompression: { month: null, weeks: [] }, patterns: [] };
    },
  });
  assert.deepEqual(seen, { userId: "user-a", read: {
    timeZone: "Asia/Kolkata", now: "2026-08-20T14:00:00.000Z", query: "room tone", kind: "LEARNING",
  } });
  assert.equal(value.query, "room tone");
});

test("retention is explicit, idempotent, source-linked, and event content stays minimal", async () => {
  const store = new MemoryStore();
  let id = 0;
  const dependencies = {
    unitOfWork: store,
    clock: { now: () => "2026-08-20T14:10:01.000Z" },
    ids: { next: (prefix: "memory-item" | "event") => `${prefix}-${++id}` },
  };
  const first = await retainMemoryItem(command, context("retain", "a"), dependencies);
  const replay = await retainMemoryItem(command, context("retain", "a"), dependencies);
  assert.equal(first.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(first.rootId, first.itemId);
  assert.equal(store.items.length, 1);
  assert.equal(store.events.length, 1);
  assert.deepEqual(Object.keys(store.events[0]!.payloadJson).sort(), [
    "authorityClass", "kind", "relationship", "revision", "rootId", "sourceDomain", "sourceEntityId",
  ]);
  assert.doesNotMatch(JSON.stringify(store.events[0]!.payloadJson), /Room tone|comparison/i);
});

test("revision preserves root history and rejects stale expected identity", async () => {
  const store = new MemoryStore();
  let id = 0;
  const dependencies = {
    unitOfWork: store,
    clock: { now: () => "2026-08-20T14:10:01.000Z" },
    ids: { next: (prefix: "memory-item" | "event") => `${prefix}-${++id}` },
  };
  const first = await retainMemoryItem(command, context("retain", "b"), dependencies);
  const revised = await reviseMemoryItem(first.rootId, {
    expectedCurrentItemId: first.itemId, kind: "LEARNING",
    title: "Room tone makes layers audible",
    body: "Short controlled comparisons make environmental layers easier to distinguish.",
  }, context("revise", "c", "2026-08-20T15:00:00.000Z"), {
    ...dependencies, clock: { now: () => "2026-08-20T15:00:01.000Z" },
  });
  assert.equal(revised.rootId, first.rootId);
  assert.equal(revised.revision, 2);
  assert.equal(revised.supersededItemId, first.itemId);
  assert.equal(store.items[0]!.status, "SUPERSEDED");
  assert.equal(store.items[1]!.status, "CURRENT");
  await assert.rejects(
    reviseMemoryItem(first.rootId, {
      expectedCurrentItemId: first.itemId, kind: "LEARNING", title: "Stale", body: "Stale revision text",
    }, context("revise", "d", "2026-08-20T16:00:00.000Z"), {
      ...dependencies, clock: { now: () => "2026-08-20T16:00:01.000Z" },
    }),
    (error: unknown) => error instanceof MemoryError && error.code === "CURRENT_MEMORY_CHANGED",
  );
});

test("one source cannot seed duplicate current Memory roots", async () => {
  const store = new MemoryStore();
  let id = 0;
  const dependencies = {
    unitOfWork: store, clock: { now: () => "2026-08-20T14:10:01.000Z" },
    ids: { next: (prefix: "memory-item" | "event") => `${prefix}-${++id}` },
  };
  await retainMemoryItem(command, context("retain", "e"), dependencies);
  await assert.rejects(
    retainMemoryItem({ ...command, title: "Duplicate" }, context("retain", "f"), dependencies),
    (error: unknown) => error instanceof MemoryError && error.code === "CANDIDATE_ALREADY_RETAINED",
  );
});
