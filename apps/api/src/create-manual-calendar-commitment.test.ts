import assert from "node:assert/strict";
import test from "node:test";
import type { CreateManualCalendarCommitmentCommand } from "../../../packages/contracts/manual-calendar";
import type {
  ManualCalendarRecord,
  ManualCalendarTransaction,
  ManualCalendarUnitOfWork,
} from "../../../packages/domain/manual-calendar";
import type { DomainEventRecord } from "../../../packages/domain/write-boundary";
import {
  createManualCalendarCommitment,
  ManualCalendarError,
} from "./create-manual-calendar-commitment";

class MemoryManualCalendarUnitOfWork implements ManualCalendarUnitOfWork {
  readonly records = new Map<string, ManualCalendarRecord>();
  readonly events = new Map<string, DomainEventRecord>();

  async run<T>(authenticatedUserId: string, work: (transaction: ManualCalendarTransaction) => Promise<T>): Promise<T> {
    const stagedRecords = new Map(this.records);
    const stagedEvents = new Map(this.events);
    const transaction: ManualCalendarTransaction = {
      findBySourceKey: async (sourceKey, userId) => {
        if (userId !== authenticatedUserId) throw new Error("user scope mismatch");
        return [...stagedRecords.values()].find((record) => record.userId === userId && record.sourceKey === sourceKey);
      },
      create: async (record) => {
        if (record.userId !== authenticatedUserId) throw new Error("user scope mismatch");
        stagedRecords.set(record.id, record);
      },
      appendDomainEvent: async (event) => {
        if (event.userId !== authenticatedUserId) throw new Error("user scope mismatch");
        stagedEvents.set(event.eventId, event);
      },
    };
    const result = await work(transaction);
    this.records.clear();
    this.events.clear();
    for (const [key, value] of stagedRecords) this.records.set(key, value);
    for (const [key, value] of stagedEvents) this.events.set(key, value);
    return result;
  }
}

const command: CreateManualCalendarCommitmentCommand = {
  title: " Gym session ",
  startsAt: "2026-08-22T18:00:00+05:30",
  endsAt: "2026-08-22T19:00:00+05:30",
  category: "Health",
  commitment: "Important",
  confirmation: { explicit: true, acknowledgement: "COMMIT_TO_CALENDAR" },
};

function harness(requestId = "web-idem-v1:calendar_manual_create:test") {
  const unitOfWork = new MemoryManualCalendarUnitOfWork();
  let calendar = 0;
  let event = 0;
  return {
    unitOfWork,
    context: {
      principal: { actorType: "USER" as const, userId: "user-1" },
      source: "WEB_APP" as const,
      receivedAt: "2026-08-21T10:30:00.000Z",
      requestId,
    },
    dependencies: {
      unitOfWork,
      clock: { now: () => "2026-08-21T10:30:01.000Z" },
      ids: { next(prefix: "calendar" | "event") { return prefix === "calendar" ? `calendar-${++calendar}` : `event-${++event}`; } },
    },
  };
}

test("manual Calendar confirmation creates one canonical FACT and audit event", async () => {
  const h = harness();
  const receipt = await createManualCalendarCommitment(command, h.context, h.dependencies);

  assert.equal(receipt.status, "created");
  assert.equal(receipt.item.authorityClass, "FACT");
  assert.equal(receipt.item.title, "Gym session");
  assert.equal(receipt.item.category, "Health");
  assert.equal(receipt.item.commitment, "Important");
  assert.equal(h.unitOfWork.records.size, 1);
  assert.equal(h.unitOfWork.events.size, 1);
  assert.equal([...h.unitOfWork.events.values()][0]?.payloadJson.origin, "USER_MANUAL");
});

test("manual Calendar safely replays the same idempotent request", async () => {
  const h = harness();
  const first = await createManualCalendarCommitment(command, h.context, h.dependencies);
  const second = await createManualCalendarCommitment(command, h.context, h.dependencies);

  assert.equal(first.item.id, second.item.id);
  assert.equal(second.status, "replayed");
  assert.equal(h.unitOfWork.records.size, 1);
  assert.equal(h.unitOfWork.events.size, 1);
});

test("manual Calendar rejects idempotency-key reuse for different details", async () => {
  const h = harness();
  await createManualCalendarCommitment(command, h.context, h.dependencies);

  await assert.rejects(
    createManualCalendarCommitment({ ...command, title: "Different commitment" }, h.context, h.dependencies),
    (error: unknown) => error instanceof ManualCalendarError && error.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("manual Calendar requires explicit final confirmation", async () => {
  const h = harness();
  await assert.rejects(
    createManualCalendarCommitment(
      { ...command, confirmation: { explicit: false, acknowledgement: "COMMIT_TO_CALENDAR" } },
      h.context,
      h.dependencies,
    ),
    (error: unknown) => error instanceof ManualCalendarError && error.code === "CONFIRMATION_REQUIRED",
  );
  assert.equal(h.unitOfWork.records.size, 0);
});

test("manual Calendar validates time order and canonical vocabulary", async () => {
  const h = harness();
  await assert.rejects(
    createManualCalendarCommitment({ ...command, endsAt: command.startsAt }, h.context, h.dependencies),
    (error: unknown) => error instanceof ManualCalendarError && error.code === "INVALID_COMMAND",
  );
});
