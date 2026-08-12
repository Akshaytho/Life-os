import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { captureAndPropose } from "./capture-and-propose";
import { getInteractionChangeTrace } from "./get-interaction-change-trace";
import { rejectRoutingProposal, ProposalRejectionError } from "./reject-routing-proposal";
import { PostgresInteractionChangeLedgerReader } from "../../../packages/database/postgres-interaction-change-ledger-reader";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "proposal_rejection_test";
const appRole = "lifeos_proposal_rejection_test_app";
const appPassword = "lifeos_proposal_rejection_test_password";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({ connectionString: appUrl.toString(), max: 4, options: `-c search_path=${schema}` });

const interpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "TENTATIVE",
      confidence: 0.81,
      observations: [
        { id: "certainty", label: "Certainty", value: "Tentative language detected", trustClass: "OBSERVATION" },
      ],
      clarification: "Do you want to reserve Saturday evening?",
      proposals: [
        {
          key: "friend-plan",
          destination: "CALENDAR",
          operation: "CREATE_CALENDAR_PLAN",
          summary: "Prepare a tentative friend plan",
          targetTrustClass: "FACT",
          approvalMode: "EXPLICIT_CONFIRMATION",
          state: "NEEDS_CONFIRMATION",
          reason: "The plan is only tentative.",
          payloadJson: {
            title: "Meet friend",
            category: "Friends",
            commitment: "Flexible",
          },
        },
      ],
    };
  },
};

function context(userId: string, requestId: string, receivedAt: string): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt,
    requestId,
  };
}

function ids() {
  let value = 0;
  return {
    next(prefix: string) {
      value += 1;
      return `${prefix}-rejection-${value}`;
    },
  };
}

before(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);

  for (const file of [
    "0001_write_boundary.sql",
    "0002_capture_routing_proposal.sql",
    "0003_proposal_creation_provenance.sql",
    "0004_row_level_authorization.sql",
    "0005_proposal_rejection_provenance.sql",
  ]) {
    const migration = await readFile(`packages/database/migrations/${file}`, "utf8");
    await ownerPool.query(migration);
  }

  await adminPool.query(
    `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  await adminPool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT EXECUTE ON FUNCTION ${schema}.lifeos_current_user_id() TO ${appRole}`);
});

beforeEach(async () => {
  await ownerPool.query(`
    TRUNCATE TABLE proposal_rejection, routing_proposal, routing_interpretation, capture_record,
      applied_proposal, domain_event, calendar_event CASCADE
  `);
});

after(async () => {
  await appPool.end();
  await ownerPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.end();
});

test("rejection is a durable user action with zero canonical life mutation", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  const reader = new PostgresInteractionChangeLedgerReader(appPool);
  const routingIds = ids();
  let tick = 0;
  const clock = {
    // Capture and interpretation consume earlier ticks. Keep the persistence clock
    // anchored at/after the later trusted rejection action rather than violating
    // the rejected_at <= recorded_at provenance invariant with an artificial fixture.
    now: () => new Date(Date.parse("2026-08-13T03:33:00.000Z") + ++tick * 1000).toISOString(),
  };

  const capture = await captureAndPropose(
    { rawText: "My friend may visit Saturday evening." },
    context("user-reject", "capture-reject", "2026-08-13T03:30:00.000Z"),
    { unitOfWork, interpreter, clock, ids: routingIds },
  );

  await assert.rejects(
    () => rejectRoutingProposal(
      { proposalId: capture.proposalIds[0], reason: "Keep Saturday open" },
      context("other-user", "cross-user-reject", "2026-08-13T03:32:00.000Z"),
      { unitOfWork, clock },
    ),
    (error: unknown) => error instanceof ProposalRejectionError && /unavailable/.test(error.message),
  );

  const rejected = await rejectRoutingProposal(
    { proposalId: capture.proposalIds[0], reason: "Keep Saturday open" },
    context("user-reject", "reject-own", "2026-08-13T03:33:00.000Z"),
    { unitOfWork, clock },
  );

  assert.equal(rejected.idempotentReplay, false);
  assert.equal(rejected.rejectedAt, "2026-08-13T03:33:00.000Z");
  assert.equal(rejected.rejectedByActorId, "user-reject");

  const replay = await rejectRoutingProposal(
    { proposalId: capture.proposalIds[0], reason: "Keep Saturday open" },
    context("user-reject", "reject-retry", "2026-08-13T03:35:00.000Z"),
    { unitOfWork, clock },
  );
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.rejectedAt, rejected.rejectedAt);
  assert.equal(replay.recordedAt, rejected.recordedAt);

  const proposal = await ownerPool.query<{ state: string }>(
    "SELECT state FROM routing_proposal WHERE proposal_id = $1",
    [capture.proposalIds[0]],
  );
  assert.equal(proposal.rows[0]?.state, "REJECTED");

  const rejection = await ownerPool.query<{
    user_id: string;
    rejected_at: Date;
    recorded_at: Date;
    rejected_by_actor_id: string;
    reason: string;
  }>(
    `SELECT user_id, rejected_at, recorded_at, rejected_by_actor_id, reason
       FROM proposal_rejection WHERE proposal_id = $1`,
    [capture.proposalIds[0]],
  );
  assert.equal(rejection.rows[0]?.user_id, "user-reject");
  assert.equal(rejection.rows[0]?.rejected_by_actor_id, "user-reject");
  assert.equal(rejection.rows[0]?.reason, "Keep Saturday open");

  const calendar = await ownerPool.query("SELECT id FROM calendar_event");
  const events = await ownerPool.query("SELECT event_id FROM domain_event");
  assert.equal(calendar.rowCount, 0);
  assert.equal(events.rowCount, 0);

  const trace = await getInteractionChangeTrace(
    capture.captureId,
    { actorType: "USER", userId: "user-reject" },
    { reader },
  );
  assert.ok(trace);
  assert.equal(trace.status, "CLOSED_NO_CHANGE");
  assert.equal(trace.proposals[0].state, "REJECTED");
  assert.deepEqual(trace.proposals[0].userAction, {
    authorityClass: "DECISION",
    action: "REJECTED",
    actorType: "USER",
    actorId: "user-reject",
    at: rejected.rejectedAt,
    recordedAt: rejected.recordedAt,
    reason: "Keep Saturday open",
  });
  assert.equal(trace.proposals[0].canonicalChange, undefined);

  const unscoped = await appPool.query("SELECT proposal_id FROM proposal_rejection");
  assert.equal(unscoped.rowCount, 0);
});
