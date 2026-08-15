import assert from "node:assert/strict";
import test from "node:test";
import type {
  DirectionDecisionDomainEventRecord,
  DirectionDecisionRecord,
  DirectionDecisionTransaction,
  DirectionDecisionUnitOfWork,
} from "../../../packages/domain/direction-decision";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import {
  activateDirectionDecision,
  DirectionDecisionError,
} from "./activate-direction-decision";
import { withWebWriteIdempotency } from "./web-write-idempotency";

class MemoryDirectionUnitOfWork implements DirectionDecisionUnitOfWork {
  readonly directions: DirectionDecisionRecord[] = [];
  readonly events: DirectionDecisionDomainEventRecord[] = [];
  runs = 0;

  async run<T>(authenticatedUserId: string, work: (transaction: DirectionDecisionTransaction) => Promise<T>): Promise<T> {
    this.runs += 1;
    const transaction: DirectionDecisionTransaction = {
      findByRequestId: async (requestId, userId) => this.directions.find(
        (direction) => direction.requestId === requestId && direction.userId === userId,
      ),
      getActiveForUpdate: async (userId) => this.directions.find(
        (direction) => direction.userId === userId && direction.status === "ACTIVE",
      ),
      supersedeActive: async (directionId, userId, endedAt) => {
        const direction = this.directions.find(
          (candidate) => candidate.directionId === directionId && candidate.userId === userId && candidate.status === "ACTIVE",
        );
        if (!direction) throw new Error("missing active direction");
        direction.status = "SUPERSEDED";
        direction.endedAt = endedAt;
      },
      createDirection: async (record) => {
        assert.equal(record.userId, authenticatedUserId);
        this.directions.push(structuredClone(record));
      },
      appendDomainEvent: async (event) => {
        assert.equal(event.userId, authenticatedUserId);
        this.events.push(structuredClone(event));
      },
    };

    return work(transaction);
  }
}

function rawContext(requestId: string, receivedAt = "2026-08-16T20:00:00.000Z"): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId: "user-a" },
    source: "WEB_APP",
    receivedAt,
    requestId,
  };
}

function context(idempotencyKey: string, receivedAt = "2026-08-16T20:00:00.000Z"): WriteRequestContext {
  return withWebWriteIdempotency(
    rawContext("transport-request", receivedAt),
    "DIRECTION_SET_CURRENT",
    idempotencyKey,
  );
}

function ids() {
  let direction = 0;
  let event = 0;
  return {
    next(prefix: "direction" | "event") {
      if (prefix === "direction") return `direction-${++direction}`;
      return `event-${++event}`;
    },
  };
}

function command(statement: string, expectedCurrentDirectionId: string | null = null) {
  return {
    statement,
    expectedCurrentDirectionId,
    approval: { explicit: true, acknowledgement: "SET_AS_CURRENT_DIRECTION" as const },
  };
}

test("creates a user-authored Direction DECISION only after explicit high-authority acknowledgement", async () => {
  const unitOfWork = new MemoryDirectionUnitOfWork();
  const receipt = await activateDirectionDecision(
    command("Build a self-reliant travel creator path while keeping my full-time job."),
    context("direction-request-0001"),
    {
      unitOfWork,
      clock: { now: () => "2026-08-16T20:00:01.000Z" },
      ids: ids(),
    },
  );

  assert.deepEqual(receipt, {
    directionId: "direction-1",
    status: "ACTIVE",
    authorityClass: "DECISION",
    decidedAt: "2026-08-16T20:00:00.000Z",
    idempotentReplay: false,
  });
  assert.equal(unitOfWork.directions.length, 1);
  assert.equal(unitOfWork.directions[0]?.statement, "Build a self-reliant travel creator path while keeping my full-time job.");
  assert.equal(unitOfWork.directions[0]?.requestId.startsWith("web-idem-v1:direction_set_current:"), true);
  assert.equal(unitOfWork.events.length, 1);
  assert.equal(unitOfWork.events[0]?.actorType, "USER");
  assert.equal(unitOfWork.events[0]?.eventType, "DIRECTION_DECISION_ACTIVATED");
  assert.equal(unitOfWork.events[0]?.payloadJson.authorityClass, "DECISION");
});

test("rejects a fresh transport request ID that skipped stable Direction Idempotency-Key derivation", async () => {
  const unitOfWork = new MemoryDirectionUnitOfWork();

  await assert.rejects(
    () => activateDirectionDecision(
      command("Travel creator direction"),
      rawContext("fresh-server-request"),
      { unitOfWork, clock: { now: () => "2026-08-16T20:00:01.000Z" }, ids: ids() },
    ),
    (error: unknown) => error instanceof DirectionDecisionError && error.code === "IDEMPOTENCY_REQUIRED",
  );

  assert.equal(unitOfWork.runs, 0);
  assert.equal(unitOfWork.directions.length, 0);
});

test("rejects missing explicit acknowledgement before any state mutation", async () => {
  const unitOfWork = new MemoryDirectionUnitOfWork();

  await assert.rejects(
    () => activateDirectionDecision(
      {
        ...command("Travel creator direction"),
        approval: { explicit: false, acknowledgement: "SET_AS_CURRENT_DIRECTION" },
      },
      context("direction-no-approval-0001"),
      { unitOfWork, clock: { now: () => "2026-08-16T20:00:01.000Z" }, ids: ids() },
    ),
    (error: unknown) => error instanceof DirectionDecisionError && error.code === "APPROVAL_REQUIRED",
  );

  assert.equal(unitOfWork.directions.length, 0);
  assert.equal(unitOfWork.events.length, 0);
});

test("requires the caller to name the current Direction version before superseding it", async () => {
  const unitOfWork = new MemoryDirectionUnitOfWork();
  const generator = ids();

  const first = await activateDirectionDecision(
    command("Direction A"),
    context("direction-request-a-0001"),
    { unitOfWork, clock: { now: () => "2026-08-16T20:00:01.000Z" }, ids: generator },
  );

  await assert.rejects(
    () => activateDirectionDecision(
      command("Direction B", null),
      context("direction-request-stale-0001", "2026-08-16T20:10:00.000Z"),
      { unitOfWork, clock: { now: () => "2026-08-16T20:10:01.000Z" }, ids: generator },
    ),
    (error: unknown) => error instanceof DirectionDecisionError && error.code === "CURRENT_DIRECTION_CHANGED",
  );

  assert.equal(unitOfWork.directions.length, 1);
  assert.equal(unitOfWork.directions[0]?.directionId, first.directionId);
  assert.equal(unitOfWork.directions[0]?.status, "ACTIVE");
});

test("supersedes history instead of overwriting the previous Direction", async () => {
  const unitOfWork = new MemoryDirectionUnitOfWork();
  const generator = ids();

  const first = await activateDirectionDecision(
    command("Direction A"),
    context("direction-request-a-0001"),
    { unitOfWork, clock: { now: () => "2026-08-16T20:00:01.000Z" }, ids: generator },
  );

  const second = await activateDirectionDecision(
    command("Direction B", first.directionId),
    context("direction-request-b-0001", "2026-08-16T21:00:00.000Z"),
    { unitOfWork, clock: { now: () => "2026-08-16T21:00:01.000Z" }, ids: generator },
  );

  assert.equal(second.status, "ACTIVE");
  assert.equal(second.supersededDirectionId, first.directionId);
  assert.equal(unitOfWork.directions.length, 2);
  assert.equal(unitOfWork.directions[0]?.status, "SUPERSEDED");
  assert.equal(unitOfWork.directions[0]?.endedAt, "2026-08-16T21:00:01.000Z");
  assert.equal(unitOfWork.directions[1]?.status, "ACTIVE");
  assert.equal(unitOfWork.events.length, 2);
});

test("same Idempotency-Key is replay-safe but changed content under that key conflicts", async () => {
  const unitOfWork = new MemoryDirectionUnitOfWork();
  const generator = ids();
  const dependencies = {
    unitOfWork,
    clock: { now: () => "2026-08-16T20:00:01.000Z" },
    ids: generator,
  };

  const first = await activateDirectionDecision(
    command("Direction A"),
    context("direction-idempotent-0001"),
    dependencies,
  );
  const replay = await activateDirectionDecision(
    command("Direction A"),
    context("direction-idempotent-0001", "2026-08-16T20:05:00.000Z"),
    dependencies,
  );

  assert.equal(replay.directionId, first.directionId);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(unitOfWork.directions.length, 1);
  assert.equal(unitOfWork.events.length, 1);

  await assert.rejects(
    () => activateDirectionDecision(
      command("Direction B"),
      context("direction-idempotent-0001", "2026-08-16T20:10:00.000Z"),
      dependencies,
    ),
    (error: unknown) => error instanceof DirectionDecisionError && error.code === "IDEMPOTENCY_CONFLICT",
  );
});

test("replaying an older request after supersession reports that historical decision as SUPERSEDED", async () => {
  const unitOfWork = new MemoryDirectionUnitOfWork();
  const generator = ids();
  const dependencies = {
    unitOfWork,
    clock: { now: () => "2026-08-16T22:00:01.000Z" },
    ids: generator,
  };

  const first = await activateDirectionDecision(
    command("Direction A"),
    context("direction-request-old-0001", "2026-08-16T20:00:00.000Z"),
    dependencies,
  );
  await activateDirectionDecision(
    command("Direction B", first.directionId),
    context("direction-request-new-0001", "2026-08-16T21:00:00.000Z"),
    dependencies,
  );

  const replay = await activateDirectionDecision(
    command("Direction A"),
    context("direction-request-old-0001", "2026-08-16T22:00:00.000Z"),
    dependencies,
  );

  assert.equal(replay.status, "SUPERSEDED");
  assert.equal(replay.idempotentReplay, true);
});

test("preserves the user's internal wording instead of AI-style normalization", async () => {
  const unitOfWork = new MemoryDirectionUnitOfWork();
  const statement = "Make films with curiosity.\nKeep my job while I build the craft.";

  await activateDirectionDecision(
    command(`  ${statement}  `),
    context("direction-wording-0001"),
    { unitOfWork, clock: { now: () => "2026-08-16T20:00:01.000Z" }, ids: ids() },
  );

  assert.equal(unitOfWork.directions[0]?.statement, statement);
  assert.equal(unitOfWork.events[0]?.payloadJson.statement, statement);
});
