import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { SafeFallbackCaptureInterpreter } from "../../../packages/intelligence/safe-fallback-capture-interpreter";
import {
  actionRequest,
  authHeaders,
  captureRequest,
  PrivateApiPostgresFixture,
} from "./private-api-integration-fixture";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
const fixture = new PrivateApiPostgresFixture(databaseUrl);

before(() => fixture.setup());
beforeEach(() => fixture.reset());
after(() => fixture.teardown());

async function assertUnscopedPrivateRowsHidden() {
  for (const table of [
    "capture_record",
    "routing_interpretation",
    "routing_proposal",
    "calendar_event",
    "domain_event",
    "applied_proposal",
    "proposal_rejection",
  ]) {
    const result = await fixture.appPool.query(`SELECT count(*)::int AS count FROM ${table}`);
    assert.equal(result.rows[0].count, 0, `${table} must be hidden without authenticated RLS scope`);
  }
}

function assertTelemetryPrivate(forbidden: string[]) {
  const telemetry = JSON.stringify(fixture.telemetry);
  for (const value of forbidden) {
    assert.equal(telemetry.includes(value), false, `telemetry leaked ${value}`);
  }
}

test("combined API carries Capture → Review → Apply → committed Trace through PostgreSQL RLS", async () => {
  const runtime = await fixture.startServer();
  let captureId = "";
  let proposalId = "";

  try {
    const created = await fetch(
      `${runtime.baseUrl}/api/v1/captures`,
      captureRequest("Synthetic commit flow", "commit-flow-key-000001"),
    );
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { captureId: string; proposalIds: string[] };
    captureId = createdBody.captureId;
    proposalId = createdBody.proposalIds[0];

    const review = await fetch(
      `${runtime.baseUrl}/api/v1/captures/${captureId}/review`,
      { headers: authHeaders() },
    );
    assert.equal(review.status, 200);
    const reviewBody = await review.json() as {
      reviewState: string;
      source: { rawText: string };
      proposals: Array<{ proposalId: string; state: string }>;
    };
    assert.equal(reviewBody.reviewState, "READY_FOR_REVIEW");
    assert.equal(reviewBody.source.rawText, "Synthetic commit flow");
    assert.equal(reviewBody.proposals[0].proposalId, proposalId);
    assert.equal(reviewBody.proposals[0].state, "READY_TO_APPLY");

    const applied = await fetch(
      `${runtime.baseUrl}/api/v1/proposals/${proposalId}/apply`,
      actionRequest({ confirmation: { explicit: true } }),
    );
    assert.equal(applied.status, 200);
    assert.equal((await applied.json() as { status: string }).status, "applied");

    const trace = await fetch(
      `${runtime.baseUrl}/api/v1/interactions/${captureId}/trace`,
      { headers: authHeaders() },
    );
    assert.equal(trace.status, 200);
    const traceBody = await trace.json() as {
      status: string;
      proposals: Array<{
        state: string;
        userAction?: { action: string };
        canonicalChange?: { eventType: string; summary: string };
      }>;
    };
    assert.equal(traceBody.status, "COMMITTED");
    assert.equal(traceBody.proposals[0].state, "APPLIED");
    assert.equal(traceBody.proposals[0].userAction?.action, "APPROVED");
    assert.equal(traceBody.proposals[0].canonicalChange?.eventType, "CALENDAR_EVENT_CREATED");

    const crossUser = await fetch(
      `${runtime.baseUrl}/api/v1/captures/${captureId}/review`,
      { headers: authHeaders("other-session") },
    );
    const missing = await fetch(
      `${runtime.baseUrl}/api/v1/captures/capture-missing/review`,
      { headers: authHeaders("other-session") },
    );
    assert.equal(crossUser.status, 404);
    assert.equal(missing.status, 404);
    assert.equal(await crossUser.text(), await missing.text());

    const unknown = await fetch(`${runtime.baseUrl}/api/v1/private-unknown`);
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), { status: "not_found" });
  } finally {
    await runtime.close();
  }

  const owner = await fixture.appPool.connect();
  try {
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('lifeos.user_id', $1, true)", ["owner-user"]);
    const calendar = await owner.query("SELECT id, source_proposal_id FROM calendar_event");
    const events = await owner.query("SELECT event_id, event_type FROM domain_event");
    const applied = await owner.query("SELECT proposal_id FROM applied_proposal");
    const rejections = await owner.query("SELECT proposal_id FROM proposal_rejection");
    assert.equal(calendar.rowCount, 1);
    assert.equal(calendar.rows[0].source_proposal_id, proposalId);
    assert.equal(events.rowCount, 1);
    assert.equal(events.rows[0].event_type, "CALENDAR_EVENT_CREATED");
    assert.equal(applied.rowCount, 1);
    assert.equal(applied.rows[0].proposal_id, proposalId);
    assert.equal(rejections.rowCount, 0);
    await owner.query("ROLLBACK");
  } finally {
    owner.release();
  }

  await assertUnscopedPrivateRowsHidden();
  assertTelemetryPrivate([
    "Synthetic commit flow",
    "owner-session",
    "other-session",
    "owner-user",
    "other-user",
    "commit-flow-key-000001",
  ]);
});

test("combined API carries Capture → Review → Reject → closed no-change Trace through PostgreSQL RLS", async () => {
  const runtime = await fixture.startServer();
  let captureId = "";
  let proposalId = "";

  try {
    const created = await fetch(
      `${runtime.baseUrl}/api/v1/captures`,
      captureRequest("Synthetic reject flow", "reject-flow-key-000001"),
    );
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { captureId: string; proposalIds: string[] };
    captureId = createdBody.captureId;
    proposalId = createdBody.proposalIds[0];

    const review = await fetch(
      `${runtime.baseUrl}/api/v1/captures/${captureId}/review`,
      { headers: authHeaders() },
    );
    assert.equal(review.status, 200);
    const reviewBody = await review.json() as { proposals: Array<{ state: string }> };
    assert.equal(reviewBody.proposals[0].state, "NEEDS_CONFIRMATION");

    const rejected = await fetch(
      `${runtime.baseUrl}/api/v1/proposals/${proposalId}/reject`,
      actionRequest({ reason: "Synthetic no-write decision" }),
    );
    assert.equal(rejected.status, 200);
    const rejectedText = await rejected.text();
    assert.equal(rejectedText.includes("Synthetic no-write decision"), false);
    assert.equal((JSON.parse(rejectedText) as { status: string }).status, "rejected");

    const trace = await fetch(
      `${runtime.baseUrl}/api/v1/interactions/${captureId}/trace`,
      { headers: authHeaders() },
    );
    assert.equal(trace.status, 200);
    const traceBody = await trace.json() as {
      status: string;
      proposals: Array<{
        state: string;
        userAction?: { action: string; reason?: string };
        canonicalChange?: unknown;
      }>;
    };
    assert.equal(traceBody.status, "CLOSED_NO_CHANGE");
    assert.equal(traceBody.proposals[0].state, "REJECTED");
    assert.equal(traceBody.proposals[0].userAction?.action, "REJECTED");
    assert.equal(traceBody.proposals[0].userAction?.reason, "Synthetic no-write decision");
    assert.equal(traceBody.proposals[0].canonicalChange, undefined);
  } finally {
    await runtime.close();
  }

  const owner = await fixture.appPool.connect();
  try {
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('lifeos.user_id', $1, true)", ["owner-user"]);
    const calendar = await owner.query("SELECT id FROM calendar_event");
    const events = await owner.query("SELECT event_id FROM domain_event");
    const applied = await owner.query("SELECT proposal_id FROM applied_proposal");
    const rejections = await owner.query("SELECT proposal_id, reason FROM proposal_rejection");
    assert.equal(calendar.rowCount, 0);
    assert.equal(events.rowCount, 0);
    assert.equal(applied.rowCount, 0);
    assert.equal(rejections.rowCount, 1);
    assert.equal(rejections.rows[0].proposal_id, proposalId);
    assert.equal(rejections.rows[0].reason, "Synthetic no-write decision");
    await owner.query("ROLLBACK");
  } finally {
    owner.release();
  }

  await assertUnscopedPrivateRowsHidden();
  assertTelemetryPrivate([
    "Synthetic reject flow",
    "Synthetic no-write decision",
    "owner-session",
    "owner-user",
    "reject-flow-key-000001",
  ]);
});

test("AI-unavailable fallback persists raw Capture + Brain Dump proposal through RLS without canonical mutation", async () => {
  const rawText = "Private fallback source must stay out of telemetry and structured interpretation";
  const idempotencyKey = "fallback-flow-key-000001";
  const runtime = await fixture.startServer(new SafeFallbackCaptureInterpreter());
  let captureId = "";
  let proposalId = "";

  try {
    const created = await fetch(
      `${runtime.baseUrl}/api/v1/captures`,
      captureRequest(rawText, idempotencyKey),
    );
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { captureId: string; proposalIds: string[] };
    captureId = createdBody.captureId;
    proposalId = createdBody.proposalIds[0];
    assert.equal(createdBody.proposalIds.length, 1);

    const review = await fetch(
      `${runtime.baseUrl}/api/v1/captures/${captureId}/review`,
      { headers: authHeaders() },
    );
    assert.equal(review.status, 200);
    const reviewBody = await review.json() as {
      reviewState: string;
      source: { rawText: string };
      interpretation: {
        interpreter: string;
        intent: string;
        certainty: string;
        confidence: number;
        observations: unknown[];
      };
      proposals: Array<{
        proposalId: string;
        destination: string;
        operation: string;
        state: string;
        proposedResultClass: string;
        summary: string;
        reason: string;
      }>;
    };

    assert.equal(reviewBody.reviewState, "READY_FOR_REVIEW");
    assert.equal(reviewBody.source.rawText, rawText);
    assert.equal(reviewBody.interpretation.interpreter, "SAFE_FALLBACK");
    assert.equal(reviewBody.interpretation.intent, "RAW_THOUGHT");
    assert.equal(reviewBody.interpretation.certainty, "UNSPECIFIED");
    assert.equal(reviewBody.interpretation.confidence, 0);
    assert.equal(JSON.stringify(reviewBody.interpretation).includes(rawText), false);
    assert.equal(reviewBody.proposals.length, 1);
    assert.equal(reviewBody.proposals[0].proposalId, proposalId);
    assert.equal(reviewBody.proposals[0].destination, "BRAIN_DUMP");
    assert.equal(reviewBody.proposals[0].operation, "KEEP_RAW_CAPTURE");
    assert.equal(reviewBody.proposals[0].state, "PROPOSED");
    assert.equal(reviewBody.proposals[0].proposedResultClass, "SUGGESTION");
    assert.equal(JSON.stringify(reviewBody.proposals[0]).includes(rawText), false);
  } finally {
    await runtime.close();
  }

  const owner = await fixture.appPool.connect();
  try {
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('lifeos.user_id', $1, true)", ["owner-user"]);
    const interpretation = await owner.query(
      "SELECT interpreter, intent, certainty, confidence FROM routing_interpretation WHERE capture_id = $1",
      [captureId],
    );
    const proposal = await owner.query(
      "SELECT destination, operation, state, target_trust_class, payload_json FROM routing_proposal WHERE proposal_id = $1",
      [proposalId],
    );
    const calendar = await owner.query("SELECT id FROM calendar_event");
    const events = await owner.query("SELECT event_id FROM domain_event");
    const applied = await owner.query("SELECT proposal_id FROM applied_proposal");

    assert.equal(interpretation.rowCount, 1);
    assert.deepEqual(interpretation.rows[0], {
      interpreter: "SAFE_FALLBACK",
      intent: "RAW_THOUGHT",
      certainty: "UNSPECIFIED",
      confidence: 0,
    });
    assert.equal(proposal.rowCount, 1);
    assert.equal(proposal.rows[0].destination, "BRAIN_DUMP");
    assert.equal(proposal.rows[0].operation, "KEEP_RAW_CAPTURE");
    assert.equal(proposal.rows[0].state, "PROPOSED");
    assert.equal(proposal.rows[0].target_trust_class, "SUGGESTION");
    assert.deepEqual(proposal.rows[0].payload_json, {});
    assert.equal(calendar.rowCount, 0);
    assert.equal(events.rowCount, 0);
    assert.equal(applied.rowCount, 0);
    await owner.query("ROLLBACK");
  } finally {
    owner.release();
  }

  await assertUnscopedPrivateRowsHidden();
  assertTelemetryPrivate([rawText, idempotencyKey, "owner-session", "owner-user"]);
});
