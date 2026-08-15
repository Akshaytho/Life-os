import assert from "node:assert/strict";
import test from "node:test";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import {
  CalendarProposalConfirmationError,
  confirmCalendarProposal,
  type CalendarProposalConfirmationStore,
  type CalendarProposalForConfirmation,
  type ConfirmCalendarProposalCommand,
} from "./confirm-calendar-proposal";

function context(userId = "user-calendar-confirm"): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt: "2026-08-15T18:30:00.000Z",
    requestId: "request-calendar-confirm",
  };
}

function command(overrides: Partial<ConfirmCalendarProposalCommand["plan"]> = {}): ConfirmCalendarProposalCommand {
  return {
    proposalId: "proposal-calendar-confirm",
    plan: {
      title: "Gym",
      startsAt: "2026-08-16T17:00:00+05:30",
      endsAt: "2026-08-16T18:00:00+05:30",
      category: "Health",
      commitment: "Important",
      timeZone: "Asia/Kolkata",
      ...overrides,
    },
  };
}

class MemoryConfirmationStore implements CalendarProposalConfirmationStore {
  markCount = 0;

  constructor(public proposal: CalendarProposalForConfirmation | undefined = {
    proposalId: "proposal-calendar-confirm",
    userId: "user-calendar-confirm",
    captureId: "capture-calendar-confirm",
    destination: "CALENDAR",
    operation: "CREATE_CALENDAR_PLAN",
    approvalMode: "EXPLICIT_CONFIRMATION",
    state: "NEEDS_CONFIRMATION",
    payloadJson: {
      title: "Gym maybe",
      category: "Health",
    },
  }) {}

  async run<T>(authenticatedUserId: string, work: Parameters<CalendarProposalConfirmationStore["run"]>[1]): Promise<T> {
    return work({
      getForUpdate: async (proposalId, userId) => {
        if (!this.proposal || proposalId !== this.proposal.proposalId || userId !== authenticatedUserId) return undefined;
        if (this.proposal.userId !== authenticatedUserId) return undefined;
        return structuredClone(this.proposal);
      },
      markReady: async (proposalId, userId, payloadJson) => {
        if (!this.proposal || proposalId !== this.proposal.proposalId || userId !== authenticatedUserId) throw new Error("scope mismatch");
        if (this.proposal.state !== "NEEDS_CONFIRMATION") throw new Error("state mismatch");
        this.markCount += 1;
        this.proposal = { ...this.proposal, state: "READY_TO_APPLY", payloadJson: structuredClone(payloadJson) };
      },
    }) as Promise<T>;
  }
}

const clock = { now: () => "2026-08-15T18:31:00.000Z" };

test("user confirmation promotes only the existing Calendar suggestion and preserves interpreted fields as provenance", async () => {
  const store = new MemoryConfirmationStore();
  const receipt = await confirmCalendarProposal(command(), context(), { store, clock });

  assert.deepEqual(receipt, {
    proposalId: "proposal-calendar-confirm",
    state: "READY_TO_APPLY",
    confirmedAt: "2026-08-15T18:31:00.000Z",
    idempotentReplay: false,
  });
  assert.equal(store.markCount, 1);
  assert.equal(store.proposal?.state, "READY_TO_APPLY");
  assert.deepEqual(
    {
      title: store.proposal?.payloadJson.title,
      startsAt: store.proposal?.payloadJson.startsAt,
      endsAt: store.proposal?.payloadJson.endsAt,
      category: store.proposal?.payloadJson.category,
      commitment: store.proposal?.payloadJson.commitment,
    },
    {
      title: "Gym",
      startsAt: "2026-08-16T11:30:00.000Z",
      endsAt: "2026-08-16T12:30:00.000Z",
      category: "Health",
      commitment: "Important",
    },
  );
  const confirmation = store.proposal?.payloadJson.confirmation as Record<string, unknown>;
  assert.equal(confirmation.version, 1);
  assert.equal(confirmation.confirmedByActorId, "user-calendar-confirm");
  assert.equal(confirmation.requestId, "request-calendar-confirm");
  assert.equal(confirmation.source, "WEB_APP");
  assert.equal(confirmation.timeZone, "Asia/Kolkata");
  assert.equal(typeof confirmation.fingerprint, "string");
  assert.deepEqual(confirmation.interpretedPlan, { title: "Gym maybe", category: "Health" });
});

test("exact confirmation retry is idempotent and does not rewrite provenance", async () => {
  const store = new MemoryConfirmationStore();
  const first = await confirmCalendarProposal(command(), context(), { store, clock });
  const firstPayload = structuredClone(store.proposal?.payloadJson);
  const second = await confirmCalendarProposal(command(), context(), {
    store,
    clock: { now: () => "2026-08-15T19:00:00.000Z" },
  });

  assert.equal(first.idempotentReplay, false);
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.confirmedAt, first.confirmedAt);
  assert.equal(store.markCount, 1);
  assert.deepEqual(store.proposal?.payloadJson, firstPayload);
});

test("different second confirmation conflicts rather than silently rewriting user decision provenance", async () => {
  const store = new MemoryConfirmationStore();
  await confirmCalendarProposal(command(), context(), { store, clock });

  await assert.rejects(
    () => confirmCalendarProposal(command({ title: "Gym and cardio" }), context(), { store, clock }),
    (error: unknown) => error instanceof CalendarProposalConfirmationError && error.code === "CONFIRMATION_CONFLICT",
  );
  assert.equal(store.markCount, 1);
  assert.equal(store.proposal?.payloadJson.title, "Gym");
});

test("cross-user confirmation is unavailable instead of leaking proposal state", async () => {
  const store = new MemoryConfirmationStore();
  await assert.rejects(
    () => confirmCalendarProposal(command(), context("user-other"), { store, clock }),
    (error: unknown) => error instanceof CalendarProposalConfirmationError && error.code === "PROPOSAL_UNAVAILABLE",
  );
  assert.equal(store.markCount, 0);
});

test("high-authority or non-explicit Calendar suggestions cannot be promoted by this boundary", async () => {
  for (const approvalMode of ["HIGH_AUTHORITY_APPROVAL", "REVIEW_AND_APPLY"] as const) {
    const store = new MemoryConfirmationStore({
      proposalId: "proposal-calendar-confirm",
      userId: "user-calendar-confirm",
      captureId: "capture-calendar-confirm",
      destination: "CALENDAR",
      operation: "CREATE_CALENDAR_PLAN",
      approvalMode,
      state: "NEEDS_CONFIRMATION",
      payloadJson: {},
    });
    await assert.rejects(
      () => confirmCalendarProposal(command(), context(), { store, clock }),
      (error: unknown) => error instanceof CalendarProposalConfirmationError && error.code === "PROPOSAL_NOT_CONFIRMABLE",
    );
    assert.equal(store.markCount, 0);
  }
});

test("confirmation requires complete absolute times, known category/commitment and a valid IANA timezone", async () => {
  const invalidPlans: Partial<ConfirmCalendarProposalCommand["plan"]>[] = [
    { startsAt: "2026-08-16T17:00" },
    { endsAt: "2026-08-16T16:00:00+05:30" },
    { timeZone: "Mars/Olympus" },
    { category: "UNRESOLVED" as ConfirmCalendarProposalCommand["plan"]["category"] },
    { commitment: "UNRESOLVED" as ConfirmCalendarProposalCommand["plan"]["commitment"] },
  ];

  for (const plan of invalidPlans) {
    const store = new MemoryConfirmationStore();
    await assert.rejects(
      () => confirmCalendarProposal(command(plan), context(), { store, clock }),
      (error: unknown) => error instanceof CalendarProposalConfirmationError && error.code === "INVALID_REQUEST",
    );
    assert.equal(store.markCount, 0);
  }
});

test("already applied or rejected proposals cannot re-enter confirmation", async () => {
  for (const state of ["APPLIED", "REJECTED", "PROPOSED"] as const) {
    const store = new MemoryConfirmationStore({
      proposalId: "proposal-calendar-confirm",
      userId: "user-calendar-confirm",
      captureId: "capture-calendar-confirm",
      destination: "CALENDAR",
      operation: "CREATE_CALENDAR_PLAN",
      approvalMode: "EXPLICIT_CONFIRMATION",
      state,
      payloadJson: {},
    });
    await assert.rejects(
      () => confirmCalendarProposal(command(), context(), { store, clock }),
      (error: unknown) => error instanceof CalendarProposalConfirmationError && error.code === "PROPOSAL_NOT_CONFIRMABLE",
    );
  }
});
