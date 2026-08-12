import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import type {
  ApplyCalendarPlanProposalCommand,
  Clock,
  IdGenerator,
  WriteRequestContext,
} from "../../../packages/domain/write-boundary";
import { applyCalendarPlanProposal, ProposalValidationError } from "./apply-calendar-plan-proposal";

class FixedClock implements Clock {
  now() { return "2026-08-12T18:30:00.000Z"; }
}

class SequenceIds implements IdGenerator {
  private counts = { calendar: 0, event: 0 };

  next(prefix: "calendar" | "event") {
    this.counts[prefix] += 1;
    return `${prefix}-${this.counts[prefix]}`;
  }
}

function command(overrides: Partial<ApplyCalendarPlanProposalCommand> = {}): ApplyCalendarPlanProposalCommand {
  const base: ApplyCalendarPlanProposalCommand = {
    proposalId: "proposal-1",
    proposalState: "READY_TO_APPLY",
    approvalMode: "REVIEW_AND_APPLY",
    destination: "CALENDAR",
    operation: "CREATE_CALENDAR_PLAN",
    sourceText: "Gym tomorrow at 7 PM.",
    correlationId: "capture-1",
    confirmation: { explicit: true },
    plan: {
      title: "Gym",
      startsAt: "2026-08-13T13:30:00.000Z",
      endsAt: "2026-08-13T14:30:00.000Z",
      category: "Health",
      commitment: "Important",
    },
  };

  return {
    ...base,
    ...overrides,
    confirmation: { ...base.confirmation, ...(overrides.confirmation ?? {}) },
    plan: { ...base.plan, ...(overrides.plan ?? {}) },
  };
}

function requestContext(overrides: Partial<WriteRequestContext> = {}): WriteRequestContext {
  const base: WriteRequestContext = {
    principal: { actorType: "USER", userId: "user-1" },
    source: "WEB_APP",
    receivedAt: "2026-08-12T18:29:58.000Z",
    requestId: "request-1",
  };

  return {
    ...base,
    ...overrides,
    principal: { ...base.principal, ...(overrides.principal ?? {}) },
  };
}

function dependencies(unitOfWork = new InMemoryWriteUnitOfWork()) {
  return { unitOfWork, clock: new FixedClock(), ids: new SequenceIds() };
}

test("commits canonical state using authenticated request identity", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const receipt = await applyCalendarPlanProposal(command(), requestContext(), dependencies(unitOfWork));
  const state = unitOfWork.snapshot();

  assert.equal(receipt.idempotentReplay, false);
  assert.equal(state.calendarPlans.length, 1);
  assert.equal(state.domainEvents.length, 1);
  assert.equal(state.appliedProposals.length, 1);

  const plan = state.calendarPlans[0];
  const event = state.domainEvents[0];
  const applied = state.appliedProposals[0];

  assert.equal(plan.userId, "user-1");
  assert.equal(event.entityId, plan.id);
  assert.equal(event.actorType, "USER");
  assert.equal(event.actorId, "user-1");
  assert.equal(event.occurredAt, "2026-08-12T18:29:58.000Z");
  assert.equal(event.recordedAt, "2026-08-12T18:30:00.000Z");
  assert.equal(event.source, "WEB_APP");
  assert.equal(applied.confirmedByActorId, "user-1");
});

test("ignores forged identity/source fields hidden in proposal-shaped input", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const forged = {
    ...command(),
    source: "AI_CHAT",
    confirmation: { explicit: true, actorId: "forged-user", confirmedAt: "1999-01-01T00:00:00.000Z" },
  } as unknown as ApplyCalendarPlanProposalCommand;

  await applyCalendarPlanProposal(forged, requestContext(), dependencies(unitOfWork));
  const state = unitOfWork.snapshot();

  assert.equal(state.calendarPlans[0].userId, "user-1");
  assert.equal(state.domainEvents[0].actorId, "user-1");
  assert.equal(state.domainEvents[0].source, "WEB_APP");
  assert.equal(state.domainEvents[0].occurredAt, "2026-08-12T18:29:58.000Z");
});

test("rolls back the Calendar row when event append fails", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.failNextAt("APPEND_EVENT");

  await assert.rejects(
    () => applyCalendarPlanProposal(command(), requestContext(), dependencies(unitOfWork)),
    /Injected transaction failure/,
  );

  assert.equal(unitOfWork.snapshot().calendarPlans.length, 0);
});

test("rolls back state when marking the proposal applied fails", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.failNextAt("MARK_APPLIED");

  await assert.rejects(
    () => applyCalendarPlanProposal(command(), requestContext(), dependencies(unitOfWork)),
    /Injected transaction failure/,
  );

  const state = unitOfWork.snapshot();
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
});

test("is idempotent for the same proposal and authenticated user", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const deps = dependencies(unitOfWork);
  const context = requestContext();

  const first = await applyCalendarPlanProposal(command(), context, deps);
  const second = await applyCalendarPlanProposal(command(), { ...context, requestId: "request-retry" }, deps);

  assert.equal(second.idempotentReplay, true);
  assert.equal(second.entityId, first.entityId);
  assert.equal(unitOfWork.snapshot().calendarPlans.length, 1);
});

test("rejects reuse of a proposal id with different content", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const deps = dependencies(unitOfWork);
  const context = requestContext();

  await applyCalendarPlanProposal(command(), context, deps);

  await assert.rejects(
    () => applyCalendarPlanProposal(command({ plan: { ...command().plan, title: "Different plan" } }), context, deps),
    (error: unknown) => error instanceof ProposalValidationError && /different content/.test(error.message),
  );
});

test("rejects reuse of a proposal id by a different authenticated user", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const deps = dependencies(unitOfWork);

  await applyCalendarPlanProposal(command(), requestContext(), deps);

  await assert.rejects(
    () => applyCalendarPlanProposal(
      command(),
      requestContext({ principal: { actorType: "USER", userId: "user-2" }, requestId: "request-2" }),
      deps,
    ),
    (error: unknown) => error instanceof ProposalValidationError && /different authenticated user/.test(error.message),
  );
});

test("refuses unresolved category data", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();

  await assert.rejects(
    () => applyCalendarPlanProposal(
      command({ plan: { ...command().plan, category: "UNRESOLVED" } }),
      requestContext(),
      dependencies(unitOfWork),
    ),
    (error: unknown) => error instanceof ProposalValidationError && /unresolved/.test(error.message),
  );
});

test("requires an explicit user Apply or Confirm action", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();

  await assert.rejects(
    () => applyCalendarPlanProposal(
      command({ confirmation: { explicit: false } }),
      requestContext(),
      dependencies(unitOfWork),
    ),
    (error: unknown) => error instanceof ProposalValidationError && /explicit user/.test(error.message),
  );
});

test("rejects invalid server request timestamps", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();

  await assert.rejects(
    () => applyCalendarPlanProposal(
      command(),
      requestContext({ receivedAt: "not-a-timestamp" }),
      dependencies(unitOfWork),
    ),
    (error: unknown) => error instanceof ProposalValidationError && /receivedAt/.test(error.message),
  );
});

test("rejects invalid Calendar time ranges before transaction", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();

  await assert.rejects(
    () => applyCalendarPlanProposal(
      command({ plan: { ...command().plan, endsAt: command().plan.startsAt } }),
      requestContext(),
      dependencies(unitOfWork),
    ),
    (error: unknown) => error instanceof ProposalValidationError && /after start/.test(error.message),
  );
});
