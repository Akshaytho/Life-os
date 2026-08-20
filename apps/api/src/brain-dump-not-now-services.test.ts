import assert from "node:assert/strict";
import test from "node:test";
import {
  brainDumpCategories,
  notNowStates,
  type ConfirmBrainDumpClassificationCommand,
} from "../../../packages/contracts/brain-dump-not-now";
import type {
  BrainDumpCaptureRecord,
  BrainDumpClassificationRecord,
  BrainDumpNotNowDomainEventRecord,
  BrainDumpNotNowTransaction,
  BrainDumpNotNowUnitOfWork,
  NotNowItemRecord,
} from "../../../packages/domain/brain-dump-not-now";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { BrainDumpNotNowError } from "./brain-dump-not-now-validation";
import { confirmBrainDumpClassification } from "./confirm-brain-dump-classification";
import { parkNotNowItem } from "./park-not-now-item";
import { reviewNotNowItem } from "./review-not-now-item";
import { withWebWriteIdempotency, type WebWriteIdempotencyScope } from "./web-write-idempotency";

class MemoryBrainDumpStore implements BrainDumpNotNowUnitOfWork {
  readonly captures: BrainDumpCaptureRecord[] = [];
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
  const store = new MemoryBrainDumpStore();
  store.captures.push({
    captureId: "capture-1",
    userId: "user-a",
    rawText: "Maybe I should change everything and start a new project.",
    source: "WEB_APP",
    receivedAt: "2026-08-18T19:59:00.000Z",
    recordedAt: "2026-08-18T19:59:01.000Z",
  });
  let id = 0;
  return {
    store,
    dependencies: {
      unitOfWork: store,
      clock: { now: () => "2026-08-18T20:00:01.000Z" },
      ids: { next: (prefix: "classification" | "not-now" | "event") => `${prefix}-${++id}` },
    },
  };
}

test("the V1 contract includes every agreed category and cannot represent PROMOTED", () => {
  assert.deepEqual(brainDumpCategories, [
    "GOAL", "IDEA", "PROBLEM", "EMOTION", "PERSON", "CONCERN", "TASK",
    "LEARNING", "TRAVEL", "CONTENT", "CAREER", "DIET", "NOT_NOW",
  ]);
  assert.equal((notNowStates as readonly string[]).includes("PROMOTED"), false);
});

test("classification preserves Capture source, versions user decisions, and emits no raw text", async () => {
  const { store, dependencies } = fixture();
  const first = await confirmBrainDumpClassification(
    "capture-1",
    { category: "IDEA", expectedCurrentClassificationId: null },
    requestContext("BRAIN_DUMP_CLASSIFY", "brain-dump-classify-0001"),
    dependencies,
  );
  const replay = await confirmBrainDumpClassification(
    "capture-1",
    { category: "IDEA", expectedCurrentClassificationId: null },
    requestContext("BRAIN_DUMP_CLASSIFY", "brain-dump-classify-0001"),
    dependencies,
  );
  assert.equal(replay.idempotentReplay, true);
  assert.equal(store.captures[0]?.rawText, "Maybe I should change everything and start a new project.");

  const revised = await confirmBrainDumpClassification(
    "capture-1",
    { category: "NOT_NOW", expectedCurrentClassificationId: first.classificationId },
    requestContext("BRAIN_DUMP_CLASSIFY", "brain-dump-classify-0002", "user-a", "2026-08-18T20:01:00.000Z"),
    { ...dependencies, clock: { now: () => "2026-08-18T20:01:01.000Z" } },
  );
  assert.equal(revised.supersededClassificationId, first.classificationId);
  assert.deepEqual(store.classifications.map((record) => record.status), ["SUPERSEDED", "CURRENT"]);
  assert.equal(JSON.stringify(store.events).includes(store.captures[0]!.rawText), false);
  assert.deepEqual(store.events.map((event) => event.eventType), [
    "BRAIN_DUMP_CLASSIFICATION_CONFIRMED",
    "BRAIN_DUMP_CLASSIFICATION_CONFIRMED",
  ]);
});

test("parking requires the user's current NOT NOW decision and creates no downstream commitment", async () => {
  const { store, dependencies } = fixture();
  const classification = await confirmBrainDumpClassification(
    "capture-1",
    { category: "NOT_NOW", expectedCurrentClassificationId: null },
    requestContext("BRAIN_DUMP_CLASSIFY", "brain-dump-classify-0003"),
    dependencies,
  );
  const receipt = await parkNotNowItem({
    captureId: "capture-1",
    classificationId: classification.classificationId,
    assessment: "TEMPORARY_INSPIRATION",
    posture: "PARK_IT",
    expectedCurrentItemId: null,
  }, requestContext("NOT_NOW_PARK", "not-now-park-key-0001"), dependencies);

  assert.equal(receipt.state, "PARKED_NOT_NOW");
  assert.equal(store.notNowItems[0]?.revision, 1);
  assert.deepEqual(store.events[1]?.payloadJson, {
    captureId: "capture-1",
    rootId: receipt.rootId,
    revision: 1,
    assessment: "TEMPORARY_INSPIRATION",
    posture: "PARK_IT",
    state: "PARKED_NOT_NOW",
    authorityClass: "DECISION",
  });
  assert.equal(JSON.stringify(store.events).includes("goal"), false);
  assert.equal(JSON.stringify(store.events).includes("project"), false);
});

test("review creates a preserved revision and blocks stale, unchanged, and terminal transitions", async () => {
  const { store, dependencies } = fixture();
  const classification = await confirmBrainDumpClassification(
    "capture-1",
    { category: "NOT_NOW", expectedCurrentClassificationId: null },
    requestContext("BRAIN_DUMP_CLASSIFY", "brain-dump-classify-0004"),
    dependencies,
  );
  const parked = await parkNotNowItem({
    captureId: "capture-1",
    classificationId: classification.classificationId,
    assessment: "WORTH_RESEARCHING",
    posture: "PARK_IT",
    expectedCurrentItemId: null,
  }, requestContext("NOT_NOW_PARK", "not-now-park-key-0002"), dependencies);

  const researched = await reviewNotNowItem(parked.rootId, {
    targetState: "RESEARCHING",
    reviewNote: "Research sound-led travel storytelling without changing direction.",
    expectedCurrentRevision: 1,
  }, requestContext("NOT_NOW_REVIEW", "not-now-review-0001", "user-a", "2026-08-18T20:02:00.000Z"), {
    ...dependencies,
    clock: { now: () => "2026-08-18T20:02:01.000Z" },
  });
  assert.equal(researched.revision, 2);
  assert.deepEqual(store.notNowItems.map((record) => record.status), ["SUPERSEDED", "CURRENT"]);

  await assert.rejects(
    reviewNotNowItem(parked.rootId, {
      targetState: "DELAYED",
      expectedCurrentRevision: 1,
    }, requestContext("NOT_NOW_REVIEW", "not-now-review-0002"), dependencies),
    (error) => error instanceof BrainDumpNotNowError && error.code === "NOT_NOW_ITEM_CHANGED",
  );

  const dismissed = await reviewNotNowItem(parked.rootId, {
    targetState: "DISMISSED",
    expectedCurrentRevision: 2,
  }, requestContext("NOT_NOW_REVIEW", "not-now-review-0003", "user-a", "2026-08-18T20:03:00.000Z"), {
    ...dependencies,
    clock: { now: () => "2026-08-18T20:03:01.000Z" },
  });
  await assert.rejects(
    reviewNotNowItem(parked.rootId, {
      targetState: "RELEASED_FOR_REVIEW",
      expectedCurrentRevision: dismissed.revision,
    }, requestContext("NOT_NOW_REVIEW", "not-now-review-0004"), dependencies),
    (error) => error instanceof BrainDumpNotNowError && error.code === "NOT_NOW_TRANSITION_NOT_ALLOWED",
  );
});

test("cross-user classification fails closed before revealing Capture existence", async () => {
  const { dependencies } = fixture();
  const command: ConfirmBrainDumpClassificationCommand = {
    category: "IDEA",
    expectedCurrentClassificationId: null,
  };
  await assert.rejects(
    confirmBrainDumpClassification(
      "capture-1",
      command,
      requestContext("BRAIN_DUMP_CLASSIFY", "brain-dump-classify-0005", "user-b"),
      dependencies,
    ),
    (error) => error instanceof BrainDumpNotNowError && error.code === "CAPTURE_NOT_FOUND",
  );
});
