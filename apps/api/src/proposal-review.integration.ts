import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { PostgresProposalReviewReader } from "../../../packages/database/postgres-proposal-review-reader";
import { getCaptureProposalReview } from "./get-capture-proposal-review";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "proposal_review_test";
const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });

const context = { principal: { actorType: "USER" as const, userId: "review-user" } };

async function seedCapture(userId = "review-user", captureId = "capture-review-1") {
  await pool.query(
    `INSERT INTO capture_record
      (capture_id, user_id, raw_text, source, correlation_id, request_id, received_at, recorded_at)
     VALUES ($1, $2, 'Gym tomorrow at 7 PM.', 'WEB_APP', $1, 'review-request-1',
             '2026-08-12T18:59:58.000Z', '2026-08-12T19:00:00.000Z')`,
    [captureId, userId],
  );
}

async function seedInterpretationAndProposal(userId = "review-user", captureId = "capture-review-1") {
  await pool.query(
    `INSERT INTO routing_interpretation
      (interpretation_id, capture_id, user_id, version, interpreter, intent, certainty,
       confidence, observations_json, clarification, created_at)
     VALUES ('interpretation-review-1', $1, $2, 1, 'LIFE_OS_AI', 'DATED_PLAN', 'CONFIRMED',
             0.94, $3::jsonb, NULL, '2026-08-12T19:00:01.000Z')`,
    [
      captureId,
      userId,
      JSON.stringify([{ id: "intent", label: "Intent", value: "Confirmed health plan", trustClass: "OBSERVATION" }]),
    ],
  );

  await pool.query(
    `INSERT INTO routing_proposal
      (proposal_id, interpreter_proposal_key, user_id, capture_id, interpretation_id,
       destination, operation, summary, target_trust_class, approval_mode, state,
       reason, payload_json, created_at)
     VALUES
      ('proposal-review-calendar', 'calendar-plan', $1, $2, 'interpretation-review-1',
       'CALENDAR', 'CREATE_CALENDAR_PLAN', 'Create the reviewed gym plan.', 'FACT',
       'REVIEW_AND_APPLY', 'READY_TO_APPLY', 'Calendar owns time-bound plans.', $3::jsonb,
       '2026-08-12T19:00:02.000Z'),
      ('proposal-review-memory', 'decision-history', $1, $2, 'interpretation-review-1',
       'MEMORY', 'RECORD_DECISION', 'Preserve the explicit decision.', 'DECISION',
       'REVIEW_AND_APPLY', 'PROPOSED', 'Decision history remains separate.', $4::jsonb,
       '2026-08-12T19:00:03.000Z')`,
    [
      userId,
      captureId,
      JSON.stringify({
        title: "Gym",
        startsAt: "2026-08-13T13:30:00.000Z",
        endsAt: "2026-08-13T14:30:00.000Z",
        category: "Health",
        commitment: "Important",
        internalOnlyField: "not a review API field",
      }),
      JSON.stringify({ decisionKind: "dated-plan", internalOnlyField: "not exposed" }),
    ],
  );
}

before(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}`);
  for (const file of [
    "0001_write_boundary.sql",
    "0002_capture_routing_proposal.sql",
    "0003_proposal_creation_provenance.sql",
  ]) {
    const migration = await readFile(`packages/database/migrations/${file}`, "utf8");
    await pool.query(migration);
  }
});

beforeEach(async () => {
  await pool.query(`
    TRUNCATE TABLE routing_proposal, routing_interpretation, capture_record,
      applied_proposal, domain_event, calendar_event CASCADE
  `);
});

after(async () => {
  await pool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.end();
});

test("PostgreSQL review projection keeps source, observation and suggestion authority separate", async () => {
  await seedCapture();
  await seedInterpretationAndProposal();

  const reader = new PostgresProposalReviewReader(pool);
  const review = await getCaptureProposalReview("capture-review-1", context, { reader });
  assert.ok(review);

  assert.equal(review.reviewState, "READY_FOR_REVIEW");
  assert.equal(review.source.authorityClass, "USER_SOURCE");
  assert.equal(review.source.rawText, "Gym tomorrow at 7 PM.");
  assert.equal(review.interpretation?.authorityClass, "OBSERVATION");
  assert.equal(review.interpretation?.interpreter, "LIFE_OS_AI");
  assert.equal(review.proposals.length, 2);
  assert.equal(review.proposals[0].authorityClass, "SUGGESTION");
  assert.equal(review.proposals[0].proposedResultClass, "FACT");
  assert.equal(review.proposals[1].authorityClass, "SUGGESTION");
  assert.equal(review.proposals[1].proposedResultClass, "DECISION");
});

test("PostgreSQL review reader is ownership scoped and does not leak another user's Capture", async () => {
  await seedCapture("owner-user", "private-capture");
  await seedInterpretationAndProposal("owner-user", "private-capture");

  const reader = new PostgresProposalReviewReader(pool);
  const review = await getCaptureProposalReview("private-capture", context, { reader });
  assert.equal(review, undefined);
});

test("PostgreSQL exposes a durable Capture awaiting interpretation without inventing AI state", async () => {
  await seedCapture();

  const reader = new PostgresProposalReviewReader(pool);
  const review = await getCaptureProposalReview("capture-review-1", context, { reader });
  assert.ok(review);
  assert.equal(review.reviewState, "AWAITING_INTERPRETATION");
  assert.equal(review.source.rawText, "Gym tomorrow at 7 PM.");
  assert.equal(review.interpretation, undefined);
  assert.deepEqual(review.proposals, []);
});

test("PostgreSQL review API projects deliberate Calendar details and hides arbitrary payload JSON", async () => {
  await seedCapture();
  await seedInterpretationAndProposal();

  const review = await getCaptureProposalReview(
    "capture-review-1",
    context,
    { reader: new PostgresProposalReviewReader(pool) },
  );
  assert.ok(review);

  assert.deepEqual(review.proposals[0].details, [
    { key: "title", label: "Title", value: "Gym" },
    { key: "startsAt", label: "Starts", value: "2026-08-13T13:30:00.000Z" },
    { key: "endsAt", label: "Ends", value: "2026-08-13T14:30:00.000Z" },
    { key: "category", label: "Category", value: "Health" },
    { key: "commitment", label: "Commitment", value: "Important" },
  ]);
  assert.equal(JSON.stringify(review).includes("internalOnlyField"), false);
});

test("PostgreSQL keeps applied proposal references visible as read-only provenance", async () => {
  await seedCapture();
  await seedInterpretationAndProposal();

  await pool.query(
    `INSERT INTO domain_event
      (event_id, user_id, occurred_at, recorded_at, actor_type, actor_id,
       event_type, entity_type, entity_id, source, correlation_id,
       causation_event_id, payload_json, schema_version)
     VALUES ('event-1', 'review-user', '2026-08-12T19:05:00.000Z', '2026-08-12T19:05:00.000Z',
             'USER', 'review-user', 'CALENDAR_EVENT_CREATED', 'calendar_event', 'calendar-1',
             'WEB_APP', 'capture-review-1', NULL, '{"proposalId":"proposal-review-calendar"}'::jsonb, 1)`,
  );

  await pool.query(
    `UPDATE routing_proposal
        SET state = 'APPLIED',
            applied_at = '2026-08-12T19:05:00.000Z',
            applied_entity_id = 'calendar-1',
            applied_event_id = 'event-1'
      WHERE proposal_id = 'proposal-review-calendar'`,
  );

  const review = await getCaptureProposalReview(
    "capture-review-1",
    context,
    { reader: new PostgresProposalReviewReader(pool) },
  );
  assert.ok(review);
  assert.equal(review.proposals[0].state, "APPLIED");
  assert.equal(review.proposals[0].appliedEntityId, "calendar-1");
  assert.equal(review.proposals[0].appliedEventId, "event-1");
});
