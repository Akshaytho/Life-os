import assert from "node:assert/strict";
import test from "node:test";
import type { PersistedCaptureProposalReview, ProposalReviewReader } from "../../../packages/domain/proposal-review";
import { getCaptureProposalReview, ProposalReviewValidationError } from "./get-capture-proposal-review";

function persistedReview(): PersistedCaptureProposalReview {
  return {
    capture: {
      captureId: "capture-1",
      userId: "user-1",
      rawText: "Gym tomorrow at 7 PM.",
      source: "WEB_APP",
      correlationId: "capture-1",
      requestId: "request-1",
      receivedAt: "2026-08-12T18:59:58.000Z",
      recordedAt: "2026-08-12T19:00:00.000Z",
    },
    interpretation: {
      interpretationId: "interpretation-1",
      captureId: "capture-1",
      userId: "user-1",
      version: 1,
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "CONFIRMED",
      confidence: 0.94,
      observations: [
        { id: "intent", label: "Intent", value: "Confirmed health plan", trustClass: "OBSERVATION" },
      ],
      createdAt: "2026-08-12T19:00:01.000Z",
    },
    proposals: [
      {
        proposalId: "proposal-1",
        interpreterProposalKey: "calendar-plan",
        userId: "user-1",
        captureId: "capture-1",
        interpretationId: "interpretation-1",
        destination: "CALENDAR",
        operation: "CREATE_CALENDAR_PLAN",
        summary: "Create the reviewed gym plan.",
        targetTrustClass: "FACT",
        approvalMode: "REVIEW_AND_APPLY",
        state: "READY_TO_APPLY",
        reason: "Calendar owns time-bound plans.",
        payloadJson: {
          title: "Gym",
          startsAt: "2026-08-13T13:30:00.000Z",
          endsAt: "2026-08-13T14:30:00.000Z",
          category: "Health",
          commitment: "Important",
          internalOnlyField: "must not become UI contract",
        },
        createdAt: "2026-08-12T19:00:01.000Z",
      },
      {
        proposalId: "proposal-2",
        interpreterProposalKey: "decision-history",
        userId: "user-1",
        captureId: "capture-1",
        interpretationId: "interpretation-1",
        destination: "MEMORY",
        operation: "RECORD_DECISION",
        summary: "Preserve the explicit decision.",
        targetTrustClass: "DECISION",
        approvalMode: "REVIEW_AND_APPLY",
        state: "PROPOSED",
        reason: "Decision history remains separate.",
        payloadJson: { decisionKind: "dated-plan", hiddenSchemaField: "not projected" },
        createdAt: "2026-08-12T19:00:01.000Z",
      },
    ],
  };
}

const MISS = Symbol("MISS");
type FixtureValue = PersistedCaptureProposalReview | typeof MISS;

class FixtureReader implements ProposalReviewReader {
  lastArgs?: { captureId: string; userId: string };

  constructor(private readonly value: FixtureValue = persistedReview()) {}

  async getCaptureReview(captureId: string, authenticatedUserId: string) {
    this.lastArgs = { captureId, userId: authenticatedUserId };
    if (this.value === MISS) return undefined;
    return structuredClone(this.value);
  }
}

const context = { principal: { actorType: "USER" as const, userId: "user-1" } };

test("keeps user source, AI observation and proposal suggestion as distinct authority classes", async () => {
  const reader = new FixtureReader();
  const review = await getCaptureProposalReview("capture-1", context, { reader });
  assert.ok(review);

  assert.equal(review.reviewState, "READY_FOR_REVIEW");
  assert.equal(review.source.authorityClass, "USER_SOURCE");
  assert.equal(review.source.rawText, "Gym tomorrow at 7 PM.");
  assert.equal(review.interpretation?.authorityClass, "OBSERVATION");
  assert.equal(review.interpretation?.observations[0].trustClass, "OBSERVATION");
  assert.equal(review.proposals[0].authorityClass, "SUGGESTION");
  assert.equal(review.proposals[0].proposedResultClass, "FACT");
  assert.equal(review.proposals[1].authorityClass, "SUGGESTION");
  assert.equal(review.proposals[1].proposedResultClass, "DECISION");
});

test("projects only deliberate Calendar review fields instead of exposing arbitrary persistence JSON", async () => {
  const review = await getCaptureProposalReview("capture-1", context, { reader: new FixtureReader() });
  assert.ok(review);

  assert.deepEqual(review.proposals[0].details, [
    { key: "title", label: "Title", value: "Gym" },
    { key: "startsAt", label: "Starts", value: "2026-08-13T13:30:00.000Z" },
    { key: "endsAt", label: "Ends", value: "2026-08-13T14:30:00.000Z" },
    { key: "category", label: "Category", value: "Health" },
    { key: "commitment", label: "Commitment", value: "Important" },
  ]);
  assert.deepEqual(review.proposals[1].details, []);
  assert.equal(JSON.stringify(review).includes("internalOnlyField"), false);
  assert.equal(JSON.stringify(review).includes("hiddenSchemaField"), false);
});

test("shows a durable Capture awaiting interpretation instead of pretending it disappeared", async () => {
  const pending = persistedReview();
  pending.interpretation = undefined;
  pending.proposals = [];

  const review = await getCaptureProposalReview("capture-1", context, { reader: new FixtureReader(pending) });
  assert.ok(review);
  assert.equal(review.reviewState, "AWAITING_INTERPRETATION");
  assert.equal(review.source.rawText, "Gym tomorrow at 7 PM.");
  assert.equal(review.interpretation, undefined);
  assert.deepEqual(review.proposals, []);
});

test("preserves applied proposal references for read-only historical inspection", async () => {
  const applied = persistedReview();
  applied.proposals[0] = {
    ...applied.proposals[0],
    state: "APPLIED",
    appliedAt: "2026-08-12T19:05:00.000Z",
    appliedEntityId: "calendar-1",
    appliedEventId: "event-1",
  };

  const review = await getCaptureProposalReview("capture-1", context, { reader: new FixtureReader(applied) });
  assert.ok(review);
  assert.equal(review.proposals[0].state, "APPLIED");
  assert.equal(review.proposals[0].appliedEntityId, "calendar-1");
  assert.equal(review.proposals[0].appliedEventId, "event-1");
});

test("passes only the authenticated principal identity into the ownership-scoped reader", async () => {
  const reader = new FixtureReader();
  await getCaptureProposalReview("capture-1", context, { reader });
  assert.deepEqual(reader.lastArgs, { captureId: "capture-1", userId: "user-1" });
});

test("returns unavailable for a reader-scoped miss without leaking cross-user existence", async () => {
  const review = await getCaptureProposalReview("capture-private", context, { reader: new FixtureReader(MISS) });
  assert.equal(review, undefined);
});

test("rejects empty Capture identity before reading persistence", async () => {
  await assert.rejects(
    () => getCaptureProposalReview("  ", context, { reader: new FixtureReader() }),
    (error: unknown) => error instanceof ProposalReviewValidationError && /captureId/.test(error.message),
  );
});
