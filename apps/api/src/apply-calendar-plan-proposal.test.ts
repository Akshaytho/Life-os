import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import type {
  ApplyStoredProposalCommand,
  Clock,
  IdGenerator,
  StoredCalendarProposal,
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

function storedProposal(overrides: Partial<StoredCalendarProposal> = {}): StoredCalendarProposal {
  const base: StoredCalendarProposal = {
    proposalId: "proposal-1",
    userId: "user-1",
    captureId: "capture-1",
    sourceText: "Gym tomorrow at 7 PM.",
    correlationId: "correlation-1",
    destination: "CALENDAR",
    operation: "CREATE_CALENDAR_PLAN",
    approvalMode: "REVIEW_AND_APPLY",
    state: "READY_TO_APPLY",
    plan: {
      title: "Gym",
      startsAt: "2026-08-13T13:30:00.000Z",
      endsAt: "2026-08-13T14:30:00.000Z",
      category: "Health",
      commitment: "Important",
    },
    createdAt: "2026-08-12T18:20:00.000Z",
  };
  return { ...base, ...overrides, plan: { ...base.plan, ...(overrides.plan ?? {}) } };
}

function command(overrides: Partial<ApplyStoredProposalCommand> = {}): ApplyStoredProposalCommand {
  return {
    proposalId: "proposal-1",
    ...overrides,
    confirmation: { explicit: true, ...(overrides.confirmation ?? {}) },
  };
}

function context(overrides: Partial<WriteRequestContext> = {}): WriteRequestContext {
  const base: WriteRequestContext = {
    principal: { actorType: "USER", userId: "user-1" },
    source: "WEB_APP",
    receivedAt: "2026-08-12T18:29:58.000Z",
    requestId: "request-1",
  };
  return { ...base, ...overrides, principal: { ...base.principal, ...(overrides.principal ?? {}) } };
}

function setup(proposal = storedProposal()) {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.seedStoredCalendarProposal(proposal);
  return { unitOfWork, dependencies: { unitOfWork, clock: new FixedClock(), ids: new SequenceIds() } };
}

test("applies the stored proposal and marks every write artifact atomically", async () => {
  const { unitOfWork, dependencies } = setup();
  const receipt = await applyCalendarPlanProposal(command(), context(), dependencies);
  const state = unitOfWork.snapshot();

  assert.equal(receipt.idempotentReplay, false);
  assert.equal(state.calendarPlans.length, 1);
  assert.equal(state.domainEvents.length, 1);
  assert.equal(state.appliedProposals.length, 1);
  assert.equal(state.storedProposals[0].state, "APPLIED");
  assert.equal(state.calendarPlans[0].title, "Gym");
  assert.equal(state.calendarPlans[0].userId, "user-1");
  assert.equal(state.domainEvents[0].payloadJson.captureId, "capture-1");
  assert.equal(state.domainEvents[0].actorId, "user-1");
});

test("client cannot redefine stored Calendar semantics during Apply", async () => {
  const { unitOfWork, dependencies } = setup();
  const forged = {
    proposalId: "proposal-1",
    confirmation: { explicit: true },
    plan: { title: "Forged trip", category: "Travel", startsAt: "2099-01-01", endsAt: "2099-01-02" },
    destination: "YOU",
    sourceText: "forged",
  } as unknown as ApplyStoredProposalCommand;

  await applyCalendarPlanProposal(forged, context(), dependencies);
  const plan = unitOfWork.snapshot().calendarPlans[0];
  assert.equal(plan.title, "Gym");
  assert.equal(plan.category, "Health");
  assert.equal(plan.startsAt, "2026-08-13T13:30:00.000Z");
});

test("proposal belonging to another authenticated user is unavailable", async () => {
  const { dependencies } = setup();
  await assert.rejects(
    () => applyCalendarPlanProposal(command(), context({ principal: { actorType: "USER", userId: "user-2" } }), dependencies),
    (error: unknown) => error instanceof ProposalValidationError && /unavailable/.test(error.message),
  );
});

test("proposal must already be ready to apply", async () => {
  const { dependencies } = setup(storedProposal({ state: "NEEDS_CONFIRMATION" }));
  await assert.rejects(
    () => applyCalendarPlanProposal(command(), context(), dependencies),
    (error: unknown) => error instanceof ProposalValidationError && /not ready/.test(error.message),
  );
});

test("unresolved stored category is rejected", async () => {
  const { dependencies } = setup(storedProposal({ plan: { ...storedProposal().plan, category: "UNRESOLVED" } }));
  await assert.rejects(
    () => applyCalendarPlanProposal(command(), context(), dependencies),
    (error: unknown) => error instanceof ProposalValidationError && /unresolved/.test(error.message),
  );
});

test("explicit Apply remains required", async () => {
  const { dependencies } = setup();
  await assert.rejects(
    () => applyCalendarPlanProposal(command({ confirmation: { explicit: false } }), context(), dependencies),
    (error: unknown) => error instanceof ProposalValidationError && /explicit user/.test(error.message),
  );
});

test("event failure rolls back canonical and proposal state", async () => {
  const { unitOfWork, dependencies } = setup();
  unitOfWork.failNextAt("APPEND_EVENT");
  await assert.rejects(() => applyCalendarPlanProposal(command(), context(), dependencies), /Injected transaction failure/);
  const state = unitOfWork.snapshot();
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
  assert.equal(state.appliedProposals.length, 0);
  assert.equal(state.storedProposals[0].state, "READY_TO_APPLY");
});

test("stored-proposal status failure rolls back Calendar, event and applied marker", async () => {
  const { unitOfWork, dependencies } = setup();
  unitOfWork.failNextAt("MARK_STORED_APPLIED");
  await assert.rejects(() => applyCalendarPlanProposal(command(), context(), dependencies), /Injected transaction failure/);
  const state = unitOfWork.snapshot();
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
  assert.equal(state.appliedProposals.length, 0);
  assert.equal(state.storedProposals[0].state, "READY_TO_APPLY");
});

test("exact replay returns the original receipt without duplicates", async () => {
  const { unitOfWork, dependencies } = setup();
  const first = await applyCalendarPlanProposal(command(), context(), dependencies);
  const second = await applyCalendarPlanProposal(command(), context({ requestId: "retry-2", receivedAt: "2026-08-12T18:31:00.000Z" }), dependencies);
  const state = unitOfWork.snapshot();

  assert.equal(second.idempotentReplay, true);
  assert.equal(second.entityId, first.entityId);
  assert.equal(second.eventId, first.eventId);
  assert.equal(state.calendarPlans.length, 1);
  assert.equal(state.domainEvents.length, 1);
  assert.equal(state.appliedProposals.length, 1);
});

test("invalid trusted request timestamp fails before mutation", async () => {
  const { unitOfWork, dependencies } = setup();
  await assert.rejects(
    () => applyCalendarPlanProposal(command(), context({ receivedAt: "invalid" }), dependencies),
    (error: unknown) => error instanceof ProposalValidationError && /receivedAt/.test(error.message),
  );
  assert.equal(unitOfWork.snapshot().calendarPlans.length, 0);
});
