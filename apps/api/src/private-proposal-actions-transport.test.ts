import assert from "node:assert/strict";
import test from "node:test";
import {
  proposalActionFixture,
  proposalActionHeaders,
  proposalFixture,
  rejectRequest,
  withProposalActionServer,
} from "./private-proposal-actions-test-fixture";

test("Reject accepts only optional text feedback and keeps invalid input out of persistence", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture({ state: "NEEDS_CONFIRMATION" }));

  await withProposalActionServer(f.deps, async (baseUrl) => {
    const cases = [
      { reason: 42 },
      { reason: "No", state: "REJECTED" },
    ];
    for (const body of cases) {
      const response = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/reject`, {
        method: "POST",
        headers: proposalActionHeaders(),
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { status: "invalid_request" });
    }

    const blank = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/reject`, rejectRequest("   "));
    assert.equal(blank.status, 400);
    assert.deepEqual(await blank.json(), { status: "invalid_request" });

    const long = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/reject`, rejectRequest("x".repeat(1001)));
    assert.equal(long.status, 400);
    assert.deepEqual(await long.json(), { status: "invalid_request" });
  });

  assert.equal(f.unitOfWork.snapshot().proposalRejections.length, 0);
});

test("authentication happens before media/body validation", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture());

  await withProposalActionServer(f.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/apply`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not-json",
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "authentication_required" });
  });
});

test("invalid path and wrong method are rejected before authentication", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture());

  await withProposalActionServer(f.deps, async (baseUrl) => {
    const invalidPath = await fetch(`${baseUrl}/api/v1/proposals/bad%20id/apply`, { method: "POST" });
    assert.equal(invalidPath.status, 404);
    assert.deepEqual(await invalidPath.json(), { status: "not_found" });

    const wrongMethod = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/apply`, { method: "GET" });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "POST");
  });

  assert.equal(f.verifier.calls.length, 0);
});

test("provider outage and wrong media type are sanitized", async () => {
  const f = proposalActionFixture();
  f.unitOfWork.seedStoredCalendarProposal(proposalFixture());

  f.verifier.fail = true;
  await withProposalActionServer(f.deps, async (baseUrl) => {
    const providerFailure = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/apply`, {
      method: "POST",
      headers: { authorization: "Bearer owner-session", "content-type": "application/json" },
      body: JSON.stringify({ confirmation: { explicit: true } }),
    });
    assert.equal(providerFailure.status, 503);
    assert.deepEqual(await providerFailure.json(), { status: "authentication_unavailable" });
  });

  f.verifier.fail = false;
  await withProposalActionServer(f.deps, async (baseUrl) => {
    const media = await fetch(`${baseUrl}/api/v1/proposals/proposal-1/apply`, {
      method: "POST",
      headers: { authorization: "Bearer owner-session", "content-type": "text/plain" },
      body: JSON.stringify({ confirmation: { explicit: true } }),
    });
    assert.equal(media.status, 415);
    assert.deepEqual(await media.json(), { status: "unsupported_media_type" });
  });
}
