import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import type { ApplyCalendarPlanProposalCommand, Clock, IdGenerator } from "../../../packages/domain/write-boundary";
import { applyCalendarPlanProposal, ProposalValidationError } from "./apply-calendar-plan-proposal";

class FixedClock implements Clock {
  now() {
    return "2026-08-12T18:30:00.000Z";
  }
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
    source: "WEB_APP",
    confirmation: {
      actorType: "USER",
      actorId: "user-1",
      confirmedAt: "2026-08-12T18:29:58.000Z",
      explicit: true,
    },
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

function dependencies(unitOfWork = new InMemoryWriteUnitOfWork()) {
  return { unitOfWork, clock: new FixedClock(), ids: new SequenceIds() };
}

test("commits canonical Calendar state, domain event and applied-proposal marker together", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const receipt = await applyCalendarPlanProposal(command(), dependencies(unitOfWork));
  const state = unitOfWork.snapshot();

  assert.equal(receipt.idempotentReplay, false);
  assert.equal(state.calendarPlans.length, 1);
  assert.equal(state.domainEvents.length, 1);
  assert.equal(state.appliedProposals.length, 1);

  const plan = state.calendarPlans[0];
  const event = state.domainEvents[0];
  const applied = state.appliedProposals[0];

  assert.equal(plan.id, receipt.entityId);
  assert.equal(event.entityId, plan.id);
  assert.equal(event.eventId, receipt.eventId);
  assert.equal(event.actorType, "USER");
  assert.equal(event.actorId, "user-1");
  assert.equal(event.occurredAt, "2026-08-12T18:29:58.000Z");
  assert.equal(event.recordedAt, "2026-08-12T18:30:00.000Z");
  assert.equal(event.correlationId, "capture-1");
  assert.equal(event.payloadJson.proposalId, "proposal-1");
  assert.equal(applied.entityId, plan.id);
  assert.equal(applied.eventId, event.eventId);
  assert.equal(applied.confirmedByActorId, "user-1");
});

test("rolls back the Calendar row when event append fails", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.failNextAt("APPEND_EVENT");

  await assert.rejects(() => applyCalendarPlanProposal(command(), dependencies(unitOfWork)), /Injected transaction failure/);

  const state = unitOfWork.snapshot();
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
  assert.equal(state.appliedProposals.length, 0);
});

test("rolls back state when marking the proposal applied fails", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.failNextAt("MARK_APPLIED");

  await assert.rejects(() => applyCalendarPlanProposal(command(), dependencies(unitOfWork)), /Injected transaction failure/);

  const state = unitOfWork.snapshot();
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
  assert.equal(state.appliedProposals.length, 0);
});

test("is idempotent when the same proposal is applied twice", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const deps = dependencies(unitOfWork);

  const first = await applyCalendarPlanProposal(command(), deps);
  const second = await applyCalendarPlanProposal(command(), deps);
  const state = unitOfWork.snapshot();

  assert.equal(first.idempotentReplay, false);
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.entityId, first.entityId);
  assert.equal(second.eventId, first.eventId);
  assert.equal(state.calendarPlans.length, 1);
  assert.equal(state.domainEvents.length, 1);
  assert.equal(state.appliedProposals.length, 1);
});

test("rejects reuse of a proposal id with different content", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const deps = dependencies(unitOfWork);

  await applyCalendarPlanProposal(command(), deps);

  await assert.rejects(
    () => applyCalendarPlanProposal(command({ plan: { ...command().plan, title: "Different plan" } }), deps),
    (error: unknown) => error instanceof ProposalValidationError && /different content/.test(error.message),
  );

  const state = unitOfWork.snapshot();
  assert.equal(state.calendarPlans.length, 1);
  assert.equal(state.domainEvents.length, 1);
});

test("rejects reuse of a proposal id by a different user", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const deps = dependencies(unitOfWork);

  await applyCalendarPlanProposal(command(), deps);

  await assert.rejects(
    () => applyCalendarPlanProposal(command({ confirmation: { ...command().confirmation, actorId: "user-2" } }), deps),
    (error: unknown) => error instanceof ProposalValidationError && /different user/.test(error.message),
  );

  assert.equal(unitOfWork.snapshot().calendarPlans.length, 1);
});

test("refuses to commit unresolved category data", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();

  await assert.rejects(
    () => applyCalendarPlanProposal(command({ plan: { ...command().plan, category: "UNRESOLVED" } }), dependencies(unitOfWork)),
    (error: unknown) => error instanceof ProposalValidationError && /unresolved/.test(error.message),
  );

  assert.equal(unitOfWork.snapshot().calendarPlans.length, 0);
});

test("requires an explicit user Apply or Confirm action", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();

  await assert.rejects(
    () => applyCalendarPlanProposal(command({ confirmation: { ...command().confirmation, explicit: false } }), dependencies(unitOfWork)),
    (error: unknown) => error instanceof ProposalValidationError && /explicit user/.test(error.message),
  );

  assert.equal(unitOfWork.snapshot().calendarPlans.length, 0);
});

test("rejects invalid time ranges before starting a transaction", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();

  await assert.rejects(
    () => applyCalendarPlanProposal(command({ plan: { ...command().plan, endsAt: command().plan.startsAt } }), dependencies(unitOfWork)),
    (error: unknown) => error instanceof ProposalValidationError && /after start/.test(error.message),
  );

  assert.equal(unitOfWork.snapshot().calendarPlans.length, 0);
});
