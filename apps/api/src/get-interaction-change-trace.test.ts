import assert from "node:assert/strict";
import test from "node:test";
import { getInteractionChangeTrace, InteractionChangeTraceError } from "./get-interaction-change-trace";
import type {
  InteractionChangeLedgerReader,
  PersistedInteractionChangeTrace,
} from "../../../packages/domain/interaction-change-ledger";

function pendingTrace(): PersistedInteractionChangeTrace {
  return {
    capture: {
      captureId: "capture-1",
      userId: "user-1",
      rawText: "My friend may visit Saturday evening.",
      source: "WEB_APP",
      correlationId: "capture-1",
      requestId: "request-secret-ish-internal",
      receivedAt: "2026-08-13T10:00:00.000Z",
      recordedAt: "2026-08-13T10:00:01.000Z",
    },
    interpretation: {
      interpretationId: "interpretation-1",
      captureId: "capture-1",
      userId: "user-1",
      version: 1,
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "TENTATIVE",
      confidence: 0.82,
      observations: [
        { id: "certainty", label: "Certainty", value: "Tentative language", trustClass: "OBSERVATION" },
      ],
      clarification: "Should this reserve time or stay only as a possibility?",
      createdAt: "2026-08-13T10:00:02.000Z",
    },
    proposals: [
      {
        proposal: {
          proposalId: "proposal-1",
          interpreterProposalKey: "friend-plan",
          userId: "user-1",
          captureId: "capture-1",
          interpretationId: "interpretation-1",
          destination: "CALENDAR",
          operation: "CREATE_CALENDAR_PLAN",
          summary: "Prepare a tentative Calendar plan",
          targetTrustClass: "FACT",
          approvalMode: "EXPLICIT_CONFIRMATION",
          state: "NEEDS_CONFIRMATION",
          reason: "The wording is tentative.",
          payloadJson: { category: "Friends" },
          createdAt: "2026-08-13T10:00:02.000Z",
        },
      },
    ],
  };
}

function committedTrace(): PersistedInteractionChangeTrace {
  const trace = pendingTrace();
  trace.capture.rawText = "Gym tomorrow at 7";
  trace.interpretation!.certainty = "CONFIRMED";
  trace.interpretation!.confidence = 0.97;
  trace.interpretation!.clarification = undefined;
  trace.proposals = [
    {
      proposal: {
        proposalId: "proposal-gym",
        interpreterProposalKey: "gym",
        userId: "user-1",
        captureId: "capture-1",
        interpretationId: "interpretation-1",
        destination: "CALENDAR",
        operation: "CREATE_CALENDAR_PLAN",
        summary: "Add gym to Calendar",
        targetTrustClass: "FACT",
        approvalMode: "REVIEW_AND_APPLY",
        state: "APPLIED",
        reason: "The user supplied a confirmed time.",
        payloadJson: {},
        createdAt: "2026-08-13T10:00:02.000Z",
        appliedAt: "2026-08-13T10:05:00.000Z",
        appliedEntityId: "calendar-1",
        appliedEventId: "event-1",
      },
      applied: {
        proposalId: "proposal-gym",
        appliedAt: "2026-08-13T10:05:00.000Z",
        confirmedByActorId: "user-1",
        requestFingerprint: "a".repeat(64),
        entityType: "calendar_event",
        entityId: "calendar-1",
        eventId: "event-1",
      },
      event: {
        eventId: "event-1",
        userId: "user-1",
        occurredAt: "2026-08-13T10:05:00.000Z",
        recordedAt: "2026-08-13T10:05:01.000Z",
        actorType: "USER",
        actorId: "user-1",
        eventType: "CALENDAR_EVENT_CREATED",
        entityType: "calendar_event",
        entityId: "calendar-1",
        source: "WEB_APP",
        correlationId: "capture-1",
        payloadJson: {
          proposalId: "proposal-gym",
          captureId: "capture-1",
          title: "Gym",
          startsAt: "2026-08-14T19:00:00.000Z",
          endsAt: "2026-08-14T20:00:00.000Z",
          category: "Health",
          commitment: "Important",
        },
        schemaVersion: 1,
      },
    },
  ];
  return trace;
}

function readerFor(value: PersistedInteractionChangeTrace | undefined): InteractionChangeLedgerReader {
  return {
    async getTrace() {
      return value;
    },
  };
}

test("pending trace keeps source, observation and suggestion separate without inventing a screen change", async () => {
  const result = await getInteractionChangeTrace(
    "capture-1",
    { actorType: "USER", userId: "user-1" },
    { reader: readerFor(pendingTrace()) },
  );

  assert.ok(result);
  assert.equal(result.status, "NEEDS_USER");
  assert.equal(result.source.authorityClass, "USER_SOURCE");
  assert.equal(result.source.text, "My friend may visit Saturday evening.");
  assert.equal(result.interpretation?.authorityClass, "OBSERVATION");
  assert.equal(result.interpretation?.clarification, "Should this reserve time or stay only as a possibility?");
  assert.equal(result.proposals[0].authorityClass, "SUGGESTION");
  assert.equal(result.proposals[0].proposedResultClass, "FACT");
  assert.equal(result.proposals[0].canonicalChange, undefined);
  assert.deepEqual(result.projectionEffects, { status: "NOT_RECORDED_YET", items: [] });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("request-secret-ish-internal"), false);
  assert.equal(serialized.includes("requestFingerprint"), false);
});

test("committed trace exposes approval and canonical event without leaking technical fingerprint", async () => {
  const result = await getInteractionChangeTrace(
    "capture-1",
    { actorType: "USER", userId: "user-1" },
    { reader: readerFor(committedTrace()) },
  );

  assert.ok(result);
  assert.equal(result.status, "COMMITTED");
  assert.deepEqual(result.proposals[0].approval, {
    authorityClass: "DECISION",
    action: "APPROVED",
    actorType: "USER",
    actorId: "user-1",
    at: "2026-08-13T10:05:00.000Z",
  });
  assert.equal(result.proposals[0].canonicalChange?.resultClass, "FACT");
  assert.equal(result.proposals[0].canonicalChange?.summary, "Calendar event created: Gym");
  assert.deepEqual(result.proposals[0].canonicalChange?.details, {
    title: "Gym",
    startsAt: "2026-08-14T19:00:00.000Z",
    endsAt: "2026-08-14T20:00:00.000Z",
    category: "Health",
    commitment: "Important",
  });
  assert.equal(JSON.stringify(result).includes("a".repeat(64)), false);
});

test("mixed applied and unresolved proposals become PARTIALLY_COMMITTED rather than pretending the interaction is finished", async () => {
  const trace = committedTrace();
  trace.proposals.push(pendingTrace().proposals[0]);

  const result = await getInteractionChangeTrace(
    "capture-1",
    { actorType: "USER", userId: "user-1" },
    { reader: readerFor(trace) },
  );

  assert.equal(result?.status, "PARTIALLY_COMMITTED");
});

test("applied event must remain inside the original Capture correlation chain", async () => {
  const trace = committedTrace();
  trace.proposals[0].event!.correlationId = "different-correlation";

  await assert.rejects(
    () => getInteractionChangeTrace(
      "capture-1",
      { actorType: "USER", userId: "user-1" },
      { reader: readerFor(trace) },
    ),
    (error: unknown) => error instanceof InteractionChangeTraceError && /correlation chain/.test(error.message),
  );
});

test("unavailable cross-user trace remains unavailable without leaking existence", async () => {
  let requestedUser = "";
  const reader: InteractionChangeLedgerReader = {
    async getTrace(_captureId, authenticatedUserId) {
      requestedUser = authenticatedUserId;
      return undefined;
    },
  };

  const result = await getInteractionChangeTrace(
    "capture-private",
    { actorType: "USER", userId: "other-user" },
    { reader },
  );

  assert.equal(requestedUser, "other-user");
  assert.equal(result, undefined);
});
