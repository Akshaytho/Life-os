import assert from "node:assert/strict";
import test from "node:test";
import type { PersistedCaptureProposalReview, ProposalReviewReader } from "../../../packages/domain/proposal-review";
import type {
  InteractionChangeLedgerReader,
  PersistedInteractionChangeTrace,
} from "../../../packages/domain/interaction-change-ledger";
import { getCaptureProposalReview, ProposalReviewValidationError } from "./get-capture-proposal-review";
import { getInteractionChangeTrace, InteractionChangeTraceError } from "./get-interaction-change-trace";

const owner = { actorType: "USER" as const, userId: "owner-user" };
const captureId = "capture-owned";
const interpretationId = "interpretation-owned";

function baseReview(): PersistedCaptureProposalReview {
  return {
    capture: {
      captureId,
      userId: owner.userId,
      rawText: "Owner source",
      source: "WEB_APP",
      correlationId: captureId,
      requestId: "request-owned",
      receivedAt: "2026-08-17T00:00:00.000Z",
      recordedAt: "2026-08-17T00:00:01.000Z",
    },
    interpretation: {
      interpretationId,
      captureId,
      userId: owner.userId,
      version: 1,
      interpreter: "SAFE_FALLBACK",
      intent: "RAW_THOUGHT",
      certainty: "UNSPECIFIED",
      confidence: 0,
      observations: [],
      clarification: "Review first",
      createdAt: "2026-08-17T00:00:02.000Z",
    },
    proposals: [{
      proposalId: "proposal-owned",
      interpreterProposalKey: "brain-dump",
      userId: owner.userId,
      captureId,
      interpretationId,
      destination: "BRAIN_DUMP",
      operation: "KEEP_RAW_CAPTURE",
      summary: "Keep raw Capture",
      targetTrustClass: "SUGGESTION",
      approvalMode: "REVIEW_AND_APPLY",
      state: "PROPOSED",
      reason: "Safe fallback",
      payloadJson: {},
      createdAt: "2026-08-17T00:00:02.000Z",
    }],
  };
}

function baseTrace(): PersistedInteractionChangeTrace {
  const review = baseReview();
  return {
    capture: review.capture,
    interpretation: review.interpretation,
    proposals: review.proposals.map((proposal) => ({ proposal })),
  };
}

function reviewReader(value: PersistedCaptureProposalReview): ProposalReviewReader {
  return { async getCaptureReview() { return structuredClone(value); } };
}

function traceReader(value: PersistedInteractionChangeTrace): InteractionChangeLedgerReader {
  return { async getTrace() { return structuredClone(value); } };
}

async function expectReviewRejected(value: PersistedCaptureProposalReview) {
  await assert.rejects(
    () => getCaptureProposalReview(captureId, { principal: owner }, { reader: reviewReader(value) }),
    (error: unknown) => error instanceof ProposalReviewValidationError,
  );
}

async function expectTraceRejected(value: PersistedInteractionChangeTrace) {
  await assert.rejects(
    () => getInteractionChangeTrace(captureId, owner, { reader: traceReader(value) }),
    (error: unknown) => error instanceof InteractionChangeTraceError,
  );
}

const hostileIds = Array.from({ length: 20 }, (_, index) => `foreign-${String(index).padStart(2, "0")}`);

test("Review fails closed across 100+ ownership/provenance permutations", async (t) => {
  let cases = 0;

  for (const hostile of hostileIds) {
    await t.test(`capture user mismatch ${hostile}`, async () => {
      const value = baseReview();
      value.capture.userId = hostile;
      await expectReviewRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`capture identity mismatch ${hostile}`, async () => {
      const value = baseReview();
      value.capture.captureId = hostile;
      await expectReviewRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`interpretation user mismatch ${hostile}`, async () => {
      const value = baseReview();
      value.interpretation!.userId = hostile;
      await expectReviewRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`interpretation Capture mismatch ${hostile}`, async () => {
      const value = baseReview();
      value.interpretation!.captureId = hostile;
      await expectReviewRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`proposal user mismatch ${hostile}`, async () => {
      const value = baseReview();
      value.proposals[0].userId = hostile;
      await expectReviewRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`proposal Capture mismatch ${hostile}`, async () => {
      const value = baseReview();
      value.proposals[0].captureId = hostile;
      await expectReviewRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`proposal interpretation mismatch ${hostile}`, async () => {
      const value = baseReview();
      value.proposals[0].interpretationId = hostile;
      await expectReviewRejected(value);
      cases += 1;
    });
  }

  await t.test("proposals cannot appear without persisted interpretation", async () => {
    const value = baseReview();
    value.interpretation = undefined;
    await expectReviewRejected(value);
    cases += 1;
  });

  assert.equal(cases, 141);
});

test("Trace fails closed across 100+ ownership/provenance permutations", async (t) => {
  let cases = 0;

  for (const hostile of hostileIds) {
    await t.test(`trace capture user mismatch ${hostile}`, async () => {
      const value = baseTrace();
      value.capture.userId = hostile;
      await expectTraceRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`trace capture identity mismatch ${hostile}`, async () => {
      const value = baseTrace();
      value.capture.captureId = hostile;
      await expectTraceRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`trace interpretation user mismatch ${hostile}`, async () => {
      const value = baseTrace();
      value.interpretation!.userId = hostile;
      await expectTraceRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`trace interpretation Capture mismatch ${hostile}`, async () => {
      const value = baseTrace();
      value.interpretation!.captureId = hostile;
      await expectTraceRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`trace proposal user mismatch ${hostile}`, async () => {
      const value = baseTrace();
      value.proposals[0].proposal.userId = hostile;
      await expectTraceRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`trace proposal Capture mismatch ${hostile}`, async () => {
      const value = baseTrace();
      value.proposals[0].proposal.captureId = hostile;
      await expectTraceRejected(value);
      cases += 1;
    });
  }

  for (const hostile of hostileIds) {
    await t.test(`trace proposal interpretation mismatch ${hostile}`, async () => {
      const value = baseTrace();
      value.proposals[0].proposal.interpretationId = hostile;
      await expectTraceRejected(value);
      cases += 1;
    });
  }

  await t.test("trace proposals cannot appear without persisted interpretation", async () => {
    const value = baseTrace();
    value.interpretation = undefined;
    await expectTraceRejected(value);
    cases += 1;
  });

  assert.equal(cases, 141);
});

test("valid owned Review and Trace remain readable after defense-in-depth checks", async () => {
  const review = await getCaptureProposalReview(captureId, { principal: owner }, { reader: reviewReader(baseReview()) });
  const trace = await getInteractionChangeTrace(captureId, owner, { reader: traceReader(baseTrace()) });

  assert.equal(review?.source.captureId, captureId);
  assert.equal(review?.proposals[0].proposalId, "proposal-owned");
  assert.equal(trace?.captureId, captureId);
  assert.equal(trace?.proposals[0].proposalId, "proposal-owned");
});
