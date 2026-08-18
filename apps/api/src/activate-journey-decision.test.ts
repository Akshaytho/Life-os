import assert from "node:assert/strict";
import test from "node:test";
import type {
  JourneyDecisionDomainEventRecord,
  JourneyDecisionRecord,
  JourneyDecisionTransaction,
  JourneyDecisionUnitOfWork,
} from "../../../packages/domain/journey-decision";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import {
  activateJourneyDecision,
  JourneyDecisionError,
} from "./activate-journey-decision";
import { withWebWriteIdempotency } from "./web-write-idempotency";

class MemoryJourneyUnitOfWork implements JourneyDecisionUnitOfWork {
  readonly journeys: JourneyDecisionRecord[] = [];
  readonly events: JourneyDecisionDomainEventRecord[] = [];
  runs = 0;

  async run<T>(authenticatedUserId: string, work: (transaction: JourneyDecisionTransaction) => Promise<T>): Promise<T> {
    this.runs += 1;
    const transaction: JourneyDecisionTransaction = {
      findByRequestId: async (requestId, userId) => this.journeys.find(
        (journey) => journey.requestId === requestId && journey.userId === userId,
      ),
      getActiveForUpdate: async (userId) => this.journeys.find(
        (journey) => journey.userId === userId && journey.status === "ACTIVE",
      ),
      supersedeActive: async (journeyId, userId, endedAt) => {
        const journey = this.journeys.find(
          (candidate) => candidate.journeyId === journeyId && candidate.userId === userId && candidate.status === "ACTIVE",
        );
        if (!journey) throw new Error("missing active journey");
        journey.status = "SUPERSEDED";
        journey.endedAt = endedAt;
      },
      createJourney: async (record) => {
        assert.equal(record.userId, authenticatedUserId);
        this.journeys.push(structuredClone(record));
      },
      appendDomainEvent: async (event) => {
        assert.equal(event.userId, authenticatedUserId);
        this.events.push(structuredClone(event));
      },
    };
    return work(transaction);
  }
}

function rawContext(requestId: string, receivedAt = "2026-08-17T12:00:00.000Z"): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId: "user-a" },
    source: "WEB_APP",
    receivedAt,
    requestId,
  };
}

function context(idempotencyKey: string, receivedAt = "2026-08-17T12:00:00.000Z"): WriteRequestContext {
  return withWebWriteIdempotency(rawContext("transport-request", receivedAt), "JOURNEY_ACTIVATE", idempotencyKey);
}

function ids() {
  let journey = 0;
  let event = 0;
  return {
    next(prefix: "journey" | "event") {
      return prefix === "journey" ? `journey-${++journey}` : `event-${++event}`;
    },
  };
}

function command(name = "Travel Creator", activeCapability = "Sound Design", expectedCurrentJourneyId: string | null = null) {
  return {
    name,
    activeCapability,
    expectedCurrentJourneyId,
    approval: { explicit: true, acknowledgement: "ACTIVATE_JOURNEY" as const },
  };
}

test("creates a Journey DECISION only after explicit user acknowledgement", async () => {
  const unitOfWork = new MemoryJourneyUnitOfWork();
  const receipt = await activateJourneyDecision(
    command(),
    context("journey-request-0001"),
    { unitOfWork, clock: { now: () => "2026-08-17T12:00:01.000Z" }, ids: ids() },
  );

  assert.deepEqual(receipt, {
    journeyId: "journey-1",
    status: "ACTIVE",
    authorityClass: "DECISION",
    decidedAt: "2026-08-17T12:00:00.000Z",
    idempotentReplay: false,
  });
  assert.equal(unitOfWork.journeys[0]?.name, "Travel Creator");
  assert.equal(unitOfWork.journeys[0]?.activeCapability, "Sound Design");
  assert.equal(unitOfWork.journeys[0]?.requestId.startsWith("web-idem-v1:journey_activate:"), true);
  assert.equal(unitOfWork.events[0]?.actorType, "USER");
  assert.equal(unitOfWork.events[0]?.eventType, "JOURNEY_DECISION_ACTIVATED");
  assert.equal(unitOfWork.events[0]?.payloadJson.authorityClass, "DECISION");
});

test("rejects activation that skipped stable Journey idempotency derivation", async () => {
  const unitOfWork = new MemoryJourneyUnitOfWork();
  await assert.rejects(
    () => activateJourneyDecision(
      command(),
      rawContext("fresh-server-request"),
      { unitOfWork, clock: { now: () => "2026-08-17T12:00:01.000Z" }, ids: ids() },
    ),
    (error: unknown) => error instanceof JourneyDecisionError && error.code === "IDEMPOTENCY_REQUIRED",
  );
  assert.equal(unitOfWork.runs, 0);
});

test("rejects missing explicit Journey approval before state mutation", async () => {
  const unitOfWork = new MemoryJourneyUnitOfWork();
  await assert.rejects(
    () => activateJourneyDecision(
      { ...command(), approval: { explicit: false, acknowledgement: "ACTIVATE_JOURNEY" } },
      context("journey-no-approval-0001"),
      { unitOfWork, clock: { now: () => "2026-08-17T12:00:01.000Z" }, ids: ids() },
    ),
    (error: unknown) => error instanceof JourneyDecisionError && error.code === "APPROVAL_REQUIRED",
  );
  assert.equal(unitOfWork.journeys.length, 0);
  assert.equal(unitOfWork.events.length, 0);
});

test("requires the caller to name the current Journey version before superseding it", async () => {
  const unitOfWork = new MemoryJourneyUnitOfWork();
  const generator = ids();
  const first = await activateJourneyDecision(
    command(),
    context("journey-request-a-0001"),
    { unitOfWork, clock: { now: () => "2026-08-17T12:00:01.000Z" }, ids: generator },
  );

  await assert.rejects(
    () => activateJourneyDecision(
      command("Travel Creator", "Editing Rhythm", null),
      context("journey-request-stale-0001", "2026-08-17T13:00:00.000Z"),
      { unitOfWork, clock: { now: () => "2026-08-17T13:00:01.000Z" }, ids: generator },
    ),
    (error: unknown) => error instanceof JourneyDecisionError && error.code === "CURRENT_JOURNEY_CHANGED",
  );
  assert.equal(unitOfWork.journeys.length, 1);
  assert.equal(unitOfWork.journeys[0]?.journeyId, first.journeyId);
  assert.equal(unitOfWork.journeys[0]?.status, "ACTIVE");
});

test("supersedes Journey history instead of overwriting it", async () => {
  const unitOfWork = new MemoryJourneyUnitOfWork();
  const generator = ids();
  const first = await activateJourneyDecision(
    command(),
    context("journey-request-a-0001"),
    { unitOfWork, clock: { now: () => "2026-08-17T12:00:01.000Z" }, ids: generator },
  );
  const second = await activateJourneyDecision(
    command("Travel Creator", "Editing Rhythm", first.journeyId),
    context("journey-request-b-0001", "2026-08-17T13:00:00.000Z"),
    { unitOfWork, clock: { now: () => "2026-08-17T13:00:01.000Z" }, ids: generator },
  );

  assert.equal(second.supersededJourneyId, first.journeyId);
  assert.equal(unitOfWork.journeys.length, 2);
  assert.equal(unitOfWork.journeys[0]?.status, "SUPERSEDED");
  assert.equal(unitOfWork.journeys[0]?.endedAt, "2026-08-17T13:00:01.000Z");
  assert.equal(unitOfWork.journeys[1]?.status, "ACTIVE");
  assert.equal(unitOfWork.events.length, 2);
});

test("same Journey Idempotency-Key replays safely and changed content conflicts", async () => {
  const unitOfWork = new MemoryJourneyUnitOfWork();
  const dependencies = { unitOfWork, clock: { now: () => "2026-08-17T12:00:01.000Z" }, ids: ids() };
  const first = await activateJourneyDecision(command(), context("journey-idempotent-0001"), dependencies);
  const replay = await activateJourneyDecision(
    command(),
    context("journey-idempotent-0001", "2026-08-17T12:05:00.000Z"),
    dependencies,
  );
  assert.equal(replay.journeyId, first.journeyId);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(unitOfWork.journeys.length, 1);
  assert.equal(unitOfWork.events.length, 1);

  await assert.rejects(
    () => activateJourneyDecision(
      command("Travel Creator", "Editing Rhythm"),
      context("journey-idempotent-0001", "2026-08-17T12:10:00.000Z"),
      dependencies,
    ),
    (error: unknown) => error instanceof JourneyDecisionError && error.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("rejects an unchanged Journey instead of creating meaningless history", async () => {
  const unitOfWork = new MemoryJourneyUnitOfWork();
  const generator = ids();
  const first = await activateJourneyDecision(
    command(),
    context("journey-unchanged-a-0001"),
    { unitOfWork, clock: { now: () => "2026-08-17T12:00:01.000Z" }, ids: generator },
  );
  await assert.rejects(
    () => activateJourneyDecision(
      command("Travel Creator", "Sound Design", first.journeyId),
      context("journey-unchanged-b-0001", "2026-08-17T13:00:00.000Z"),
      { unitOfWork, clock: { now: () => "2026-08-17T13:00:01.000Z" }, ids: generator },
    ),
    (error: unknown) => error instanceof JourneyDecisionError && error.code === "JOURNEY_UNCHANGED",
  );
  assert.equal(unitOfWork.journeys.length, 1);
  assert.equal(unitOfWork.events.length, 1);
});

test("preserves user-authored Journey wording except boundary whitespace", async () => {
  const unitOfWork = new MemoryJourneyUnitOfWork();
  await activateJourneyDecision(
    command("  Travel Creator / Documentary  ", "  Environmental Sound  "),
    context("journey-wording-0001"),
    { unitOfWork, clock: { now: () => "2026-08-17T12:00:01.000Z" }, ids: ids() },
  );
  assert.equal(unitOfWork.journeys[0]?.name, "Travel Creator / Documentary");
  assert.equal(unitOfWork.journeys[0]?.activeCapability, "Environmental Sound");
  assert.equal(unitOfWork.events[0]?.payloadJson.name, "Travel Creator / Documentary");
});
