import assert from "node:assert/strict";
import test from "node:test";
import type {
  RoutingProposalRecord,
  StoredCalendarProposal,
  WriteRequestContext,
  WriteTransaction,
  WriteUnitOfWork,
} from "../../../packages/domain/write-boundary";
import { applyCalendarPlanProposal, ProposalValidationError } from "./apply-calendar-plan-proposal";
import { rejectRoutingProposal, ProposalRejectionError } from "./reject-routing-proposal";

const authenticatedUserId = "decision-owner";
const requestedProposalId = "proposal-requested";

function context(): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId: authenticatedUserId },
    source: "WEB_APP",
    receivedAt: "2026-08-17T00:00:00.000Z",
    requestId: "decision-hardening-request",
  };
}

function storedCalendarProposal(): StoredCalendarProposal {
  return {
    proposalId: requestedProposalId,
    userId: authenticatedUserId,
    captureId: "capture-owner",
    sourceText: "Gym tomorrow at 7",
    correlationId: "capture-owner",
    destination: "CALENDAR",
    operation: "CREATE_CALENDAR_PLAN",
    approvalMode: "REVIEW_AND_APPLY",
    state: "READY_TO_APPLY",
    plan: {
      title: "Gym",
      startsAt: "2026-08-18T13:30:00.000Z",
      endsAt: "2026-08-18T14:30:00.000Z",
      category: "Health",
      commitment: "Important",
    },
    createdAt: "2026-08-17T00:00:00.000Z",
  };
}

function routingProposal(): RoutingProposalRecord {
  return {
    proposalId: requestedProposalId,
    interpreterProposalKey: "keep-raw",
    userId: authenticatedUserId,
    captureId: "capture-owner",
    interpretationId: "interpretation-owner",
    destination: "BRAIN_DUMP",
    operation: "KEEP_RAW_CAPTURE",
    summary: "Keep raw Capture",
    targetTrustClass: "SUGGESTION",
    approvalMode: "REVIEW_AND_APPLY",
    state: "PROPOSED",
    reason: "Review first",
    payloadJson: {},
    createdAt: "2026-08-17T00:00:00.000Z",
  };
}

interface GuardCounters {
  afterLookupReads: number;
  mutations: number;
}

function maliciousApplyUnitOfWork(value: StoredCalendarProposal, counters: GuardCounters): WriteUnitOfWork {
  const transaction = {
    async getStoredCalendarProposalForUpdate() { return structuredClone(value); },
    async findAppliedProposal() { counters.afterLookupReads += 1; return undefined; },
    async createCalendarPlan() { counters.mutations += 1; },
    async appendDomainEvent() { counters.mutations += 1; },
    async markProposalApplied() { counters.mutations += 1; },
    async markStoredProposalApplied() { counters.mutations += 1; },
  } as unknown as WriteTransaction;
  return {
    async run<T>(_authenticatedUserId: string, work: (transaction: WriteTransaction) => Promise<T>) {
      return work(transaction);
    },
  };
}

function maliciousRejectUnitOfWork(value: RoutingProposalRecord, counters: GuardCounters): WriteUnitOfWork {
  const transaction = {
    async getRoutingProposalForUpdate() { return structuredClone(value); },
    async findProposalRejection() { counters.afterLookupReads += 1; return undefined; },
    async createProposalRejection() { counters.mutations += 1; },
    async markRoutingProposalRejected() { counters.mutations += 1; },
  } as unknown as WriteTransaction;
  return {
    async run<T>(_authenticatedUserId: string, work: (transaction: WriteTransaction) => Promise<T>) {
      return work(transaction);
    },
  };
}

const variants = Array.from({ length: 50 }, (_, index) => index);

test("Apply fails closed for 100 malicious adapter ownership/identity returns before any further read or write", async (t) => {
  let cases = 0;

  for (const index of variants) {
    await t.test(`Apply rejects foreign owner ${index}`, async () => {
      const proposal = storedCalendarProposal();
      proposal.userId = `foreign-user-${index}`;
      const counters = { afterLookupReads: 0, mutations: 0 };
      await assert.rejects(
        () => applyCalendarPlanProposal(
          { proposalId: requestedProposalId, confirmation: { explicit: true } },
          context(),
          {
            unitOfWork: maliciousApplyUnitOfWork(proposal, counters),
            clock: { now: () => "2026-08-17T00:01:00.000Z" },
            ids: { next: (prefix) => `${prefix}-unused` },
          },
        ),
        (error: unknown) => error instanceof ProposalValidationError
          && error.message === "Proposal is unavailable for this authenticated user",
      );
      assert.deepEqual(counters, { afterLookupReads: 0, mutations: 0 });
      cases += 1;
    });
  }

  for (const index of variants) {
    await t.test(`Apply rejects wrong returned proposal ID ${index}`, async () => {
      const proposal = storedCalendarProposal();
      proposal.proposalId = `other-proposal-${index}`;
      const counters = { afterLookupReads: 0, mutations: 0 };
      await assert.rejects(
        () => applyCalendarPlanProposal(
          { proposalId: requestedProposalId, confirmation: { explicit: true } },
          context(),
          {
            unitOfWork: maliciousApplyUnitOfWork(proposal, counters),
            clock: { now: () => "2026-08-17T00:01:00.000Z" },
            ids: { next: (prefix) => `${prefix}-unused` },
          },
        ),
        (error: unknown) => error instanceof ProposalValidationError
          && error.message === "Proposal is unavailable for this authenticated user",
      );
      assert.deepEqual(counters, { afterLookupReads: 0, mutations: 0 });
      cases += 1;
    });
  }

  assert.equal(cases, 100);
});

test("Reject fails closed for 100 malicious adapter ownership/identity returns before any further read or write", async (t) => {
  let cases = 0;

  for (const index of variants) {
    await t.test(`Reject rejects foreign owner ${index}`, async () => {
      const proposal = routingProposal();
      proposal.userId = `foreign-user-${index}`;
      const counters = { afterLookupReads: 0, mutations: 0 };
      await assert.rejects(
        () => rejectRoutingProposal(
          { proposalId: requestedProposalId, reason: "No" },
          context(),
          {
            unitOfWork: maliciousRejectUnitOfWork(proposal, counters),
            clock: { now: () => "2026-08-17T00:01:00.000Z" },
          },
        ),
        (error: unknown) => error instanceof ProposalRejectionError
          && error.message === "Proposal is unavailable for this authenticated user",
      );
      assert.deepEqual(counters, { afterLookupReads: 0, mutations: 0 });
      cases += 1;
    });
  }

  for (const index of variants) {
    await t.test(`Reject rejects wrong returned proposal ID ${index}`, async () => {
      const proposal = routingProposal();
      proposal.proposalId = `other-proposal-${index}`;
      const counters = { afterLookupReads: 0, mutations: 0 };
      await assert.rejects(
        () => rejectRoutingProposal(
          { proposalId: requestedProposalId, reason: "No" },
          context(),
          {
            unitOfWork: maliciousRejectUnitOfWork(proposal, counters),
            clock: { now: () => "2026-08-17T00:01:00.000Z" },
          },
        ),
        (error: unknown) => error instanceof ProposalRejectionError
          && error.message === "Proposal is unavailable for this authenticated user",
      );
      assert.deepEqual(counters, { afterLookupReads: 0, mutations: 0 });
      cases += 1;
    });
  }

  assert.equal(cases, 100);
});
