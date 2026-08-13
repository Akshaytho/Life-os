import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRequest,
  proposalActionFixture,
  proposalFixture,
  rejectRequest,
  withProposalActionServer,
} from "./private-proposal-actions-test-fixture";

test("Reject records terminal no-write decision, hides feedback/identity, and same feedback replays", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture({ state: "NEEDS_CONFIRMATION" }));

  await withProposalActionServer(f.deps, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/reject`, rejectRequest("Not this week"));
    assert.equal(first.status, 200);
    const text = await first.text();
    assert.equal(text.includes("Not this week"), false);
    assert.equal(text.includes("owner-user"), false);
    assert.equal(text.includes("owner-session"), false);
    assert.equal((JSON.parse(text) as { status: string }).status, "rejected");

    const replay = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/reject`, rejectRequest("Not this week"));
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as { status: string }).status, "replayed");
  });

  const state = f.unitOfWork.snapshot();
  assert.equal(state.proposalRejections.length, 1);
  assert.equal(state.routingProposals[0].state, "REJECTED");
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
  const telemetry = JSON.stringify(f.telemetry);
  assert.equal(telemetry.includes("Not this week"), false);
  assert.equal(telemetry.includes("owner-user"), false);
});

test("Reject with different feedback conflicts and preserves first rejection", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture({ state: "NEEDS_CONFIRMATION" }));

  await withProposalActionServer(f.deps, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/v1/proposals/proposal-1/reject`, rejectRequest("First reason"))).status, 200);
    const conflict = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/reject`, rejectRequest("Different reason"));
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { status: "rejection_conflict" });
  });

  const state = f.unitOfWork.snapshot();
  assert.equal(state.proposalRejections.length, 1);
  assert.equal(state.proposalRejections[0].reason, "First reason");
});

test("Reject cannot follow Apply", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture());

  await withProposalActionServer(f.deps, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/v1/proposals/proposal-1/apply`, applyRequest())).status, 200);
    const response = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/reject`, rejectRequest());
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { status: "rejection_conflict" });
  });

  const state = f.unitOfWork.snapshot();
  assert.equal(state.calendarPlans.length, 1);
  assert.equal(state.domainEvents.length, 1);
  assert.equal(state.proposalRejections.length, 0);
});

test("Reject cross-user and missing proposals share generic 404", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture({ state: "NEEDS_CONFIRMATION" }));

  await withProposalActionServer(f.deps, async (baseUrl) => {
    const crossUser = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/reject`, rejectRequest(undefined, "other-session"));
    const missing = await fetch(`${baseUrl}/api/v1/proposals/proposal-missing/reject`, rejectRequest(undefined, "other-session"));
    assert.equal(crossUser.status, 404);
    assert.equal(missing.status, 404);
    assert.equal(await crossUser.text(), await missing.text());
  });
});
