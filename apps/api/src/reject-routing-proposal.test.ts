import assert from "node:assert/strict";
import test from "node:test";
import { rejectRoutingProposal, ProposalRejectionError } from "./reject-routing-proposal";
import { applyCalendarPlanProposal } from "./apply-calendar-plan-proposal";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import type { StoredCalendarProposal, WriteRequestContext } from "../../../packages/domain/write-boundary";

function context(userId: string, requestId: string, receivedAt = "2026-08-13T03:30:00.000Z"): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt,
    requestId,
  };
}

function proposal(overrides: Partial<StoredCalendarProposal> = {}): StoredCalendarProposal {
  return {
    proposalId: "proposal-reject-1",
    userId: "user-1",
    captureId: "capture-reject-1",
    sourceText: "Maybe move gym later",
    correlationId: "capture-reject-1",
    destination: "CALENDAR",
    operation: "CREATE_CALENDAR_PLAN",
    approvalMode: "EXPLICIT_CONFIRMATION",
    state: "NEEDS_CONFIRMATION",
    plan: {
      title: "Gym",
      startsAt: "2026-08-14T19:00:00.000Z",
      endsAt: "2026-08-14T20:00:00.000Z",
      category: "Health",
      commitment: "Flexible",
    },
    createdAt: "2026-08-13T03:00:00.000Z",
    ...overrides,
  };
}

function clock(value = "2026-08-13T03:30:01.000Z") {
  return { now: () => value };
}

test("rejecting a proposal records user rejection provenance but no canonical life event", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.seedStoredCalendarProposal(proposal());

  const receipt = await rejectRoutingProposal(
    { proposalId: "proposal-reject-1", reason: "I want to keep the evening open." },
    context("user-1", "reject-request-1"),
    { unitOfWork, clock: clock() },
  );

  assert.deepEqual(receipt, {
    proposalId: "proposal-reject-1",
    rejectedAt: "2026-08-13T03:30:00.000Z",
    recordedAt: "2026-08-13T03:30:01.000Z",
    rejectedByActorId: "user-1",
    reason: "I want to keep the evening open.",
    idempotentReplay: false,
  });

  const state = unitOfWork.snapshot();
  assert.equal(state.routingProposals[0].state, "REJECTED");
  assert.deepEqual(state.proposalRejections, [{
    proposalId: "proposal-reject-1",
    userId: "user-1",
    rejectedAt: "2026-08-13T03:30:00.000Z",
    recordedAt: "2026-08-13T03:30:01.000Z",
    rejectedByActorId: "user-1",
    reason: "I want to keep the evening open.",
  }]);
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
  assert.equal(state.appliedProposals.length, 0);
});

test("same rejection retry returns original provenance without another marker", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.seedStoredCalendarProposal(proposal());

  await rejectRoutingProposal(
    { proposalId: "proposal-reject-1", reason: "Not now" },
    context("user-1", "reject-request-1"),
    { unitOfWork, clock: clock("2026-08-13T03:30:01.000Z") },
  );

  const replay = await rejectRoutingProposal(
    { proposalId: "proposal-reject-1", reason: "Not now" },
    context("user-1", "reject-request-2", "2026-08-13T03:40:00.000Z"),
    { unitOfWork, clock: clock("2026-08-13T03:40:01.000Z") },
  );

  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.rejectedAt, "2026-08-13T03:30:00.000Z");
  assert.equal(replay.recordedAt, "2026-08-13T03:30:01.000Z");
  assert.equal(unitOfWork.snapshot().proposalRejections.length, 1);
});

test("retry cannot silently rewrite the original rejection feedback", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.seedStoredCalendarProposal(proposal());

  await rejectRoutingProposal(
    { proposalId: "proposal-reject-1", reason: "Not now" },
    context("user-1", "reject-request-1"),
    { unitOfWork, clock: clock() },
  );

  await assert.rejects(
    () => rejectRoutingProposal(
      { proposalId: "proposal-reject-1", reason: "Actually because of work" },
      context("user-1", "reject-request-2", "2026-08-13T03:40:00.000Z"),
      { unitOfWork, clock: clock("2026-08-13T03:40:01.000Z") },
    ),
    (error: unknown) => error instanceof ProposalRejectionError && /different feedback/.test(error.message),
  );
});

test("another authenticated user cannot reject a private proposal", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.seedStoredCalendarProposal(proposal());

  await assert.rejects(
    () => rejectRoutingProposal(
      { proposalId: "proposal-reject-1" },
      context("user-2", "reject-request-other"),
      { unitOfWork, clock: clock() },
    ),
    (error: unknown) => error instanceof ProposalRejectionError && /unavailable/.test(error.message),
  );

  assert.equal(unitOfWork.snapshot().proposalRejections.length, 0);
});

test("an already applied proposal cannot later be rewritten as rejected", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.seedStoredCalendarProposal(proposal({ state: "READY_TO_APPLY", approvalMode: "REVIEW_AND_APPLY" }));

  let id = 0;
  await applyCalendarPlanProposal(
    { proposalId: "proposal-reject-1", confirmation: { explicit: true } },
    context("user-1", "apply-first", "2026-08-13T03:20:00.000Z"),
    {
      unitOfWork,
      clock: clock("2026-08-13T03:20:01.000Z"),
      ids: { next: (prefix) => `${prefix}-${++id}` },
    },
  );

  await assert.rejects(
    () => rejectRoutingProposal(
      { proposalId: "proposal-reject-1" },
      context("user-1", "reject-after-apply", "2026-08-13T03:30:00.000Z"),
      { unitOfWork, clock: clock() },
    ),
    (error: unknown) => error instanceof ProposalRejectionError && /applied proposal cannot be rejected/.test(error.message),
  );

  const state = unitOfWork.snapshot();
  assert.equal(state.routingProposals[0].state, "APPLIED");
  assert.equal(state.proposalRejections.length, 0);
  assert.equal(state.domainEvents.length, 1);
});

test("failure while marking proposal rejected rolls back the rejection marker too", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.seedStoredCalendarProposal(proposal());
  unitOfWork.failNextAt("MARK_REJECTED");

  await assert.rejects(
    () => rejectRoutingProposal(
      { proposalId: "proposal-reject-1", reason: "No" },
      context("user-1", "reject-fail"),
      { unitOfWork, clock: clock() },
    ),
    /Injected transaction failure at MARK_REJECTED/,
  );

  const state = unitOfWork.snapshot();
  assert.equal(state.routingProposals[0].state, "NEEDS_CONFIRMATION");
  assert.equal(state.proposalRejections.length, 0);
});

test("a high-authority suggestion can still be safely declined without changing durable direction", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.seedStoredCalendarProposal(proposal({ approvalMode: "HIGH_AUTHORITY_APPROVAL", state: "PROPOSED" }));

  const receipt = await rejectRoutingProposal(
    { proposalId: "proposal-reject-1", reason: "Keep my current direction." },
    context("user-1", "reject-high-authority"),
    { unitOfWork, clock: clock() },
  );

  assert.equal(receipt.idempotentReplay, false);
  assert.equal(unitOfWork.snapshot().routingProposals[0].state, "REJECTED");
  assert.equal(unitOfWork.snapshot().domainEvents.length, 0);
});
