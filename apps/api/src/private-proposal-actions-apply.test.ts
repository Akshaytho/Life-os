import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRequest,
  proposalActionFixture,
  proposalActionHeaders,
  proposalFixture,
  withProposalActionServer,
} from "./private-proposal-actions-test-fixture";

test("Apply creates one Calendar fact/event and exact replay returns the same receipt", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture());

  await withProposalActionServer(f.deps, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/apply`, applyRequest());
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "private, no-store");
    const firstText = await first.text();
    assert.equal(firstText.includes("Synthetic source"), false);
    assert.equal(firstText.includes("owner-user"), false);
    assert.equal(firstText.includes("owner-session"), false);
    const firstBody = JSON.parse(firstText) as { status: string; entityId: string; eventId: string };
    assert.equal(firstBody.status, "applied");

    const replay = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/apply`, applyRequest());
    assert.equal(replay.status, 200);
    const replayBody = await replay.json() as { status: string; entityId: string; eventId: string };
    assert.equal(replayBody.status, "replayed");
    assert.equal(replayBody.entityId, firstBody.entityId);
    assert.equal(replayBody.eventId, firstBody.eventId);
  });

  const state = f.unitOfWork.snapshot();
  assert.equal(state.calendarPlans.length, 1);
  assert.equal(state.domainEvents.length, 1);
  assert.equal(state.appliedProposals.length, 1);
  assert.equal(state.routingProposals[0].state, "APPLIED");
  assert.equal(f.telemetry.length, 2);
  const telemetry = JSON.stringify(f.telemetry);
  assert.equal(telemetry.includes("Synthetic source"), false);
  assert.equal(telemetry.includes("owner-user"), false);
});

test("Apply requires exact explicit confirmation and ignores no client authority fields", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture());

  await withProposalActionServer(f.deps, async (baseUrl) => {
    for (const body of [
      {},
      { confirmation: { explicit: false } },
      { confirmation: { explicit: true }, userId: "forged" },
      { confirmation: { explicit: true, state: "APPLIED" } },
    ]) {
      const response = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/apply`, {
        method: "POST",
        headers: proposalActionHeaders(),
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { status: "invalid_request" });
    }
  });

  const state = f.unitOfWork.snapshot();
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
});

test("Apply cross-user and missing proposals share generic 404", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture());

  await withProposalActionServer(f.deps, async (baseUrl) => {
    const crossUser = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/apply`, applyRequest("other-session"));
    const missing = await fetch(`${baseUrl}/api/v1/proposals/proposal-missing/apply`, applyRequest("other-session"));
    assert.equal(crossUser.status, 404);
    assert.equal(missing.status, 404);
    assert.equal(await crossUser.text(), await missing.text());
  });

  assert.equal(f.unitOfWork.snapshot().calendarPlans.length, 0);
});

test("Apply refuses high-authority and non-ready proposals without canonical writes", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture({
    proposalId: "proposal-high",
    captureId: "capture-high",
    correlationId: "capture-high",
    approvalMode: "HIGH_AUTHORITY_APPROVAL",
  }));
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture({
    proposalId: "proposal-wait",
    captureId: "capture-wait",
    correlationId: "capture-wait",
    state: "NEEDS_CONFIRMATION",
  }));

  await withProposalActionServer(f.deps, async (baseUrl) => {
    for (const id of ["proposal-high", "proposal-wait"]) {
      const response = await fetch(`${baseUrl}/api/v1/proposals/${id}/apply`, applyRequest());
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { status: "proposal_not_applicable" });
    }
  });

  const state = f.unitOfWork.snapshot();
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
});
