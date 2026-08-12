import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { applyCalendarPlanProposal } from "./apply-calendar-plan-proposal";
import { captureAndPropose } from "./capture-and-propose";
import { getInteractionChangeTrace } from "./get-interaction-change-trace";
import { PostgresInteractionChangeLedgerReader } from "../../../packages/database/postgres-interaction-change-ledger-reader";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "interaction_change_ledger_test";
const appRole = "lifeos_interaction_ledger_test_app";
const appPassword = "lifeos_interaction_ledger_test_password";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({ connectionString: appUrl.toString(), max: 4, options: `-c search_path=${schema}` });

function ids() {
  let value = 0;
  return {
    next(prefix: string) {
      value += 1;
      return `${prefix}-ledger-${value}`;
    },
  };
}

function context(userId: string, requestId: string, receivedAt: string): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt,
    requestId,
  };
}

const confirmedInterpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "CONFIRMED",
      confidence: 0.96,
      observations: [
        { id: "time", label: "Time", value: "Explicit time detected", trustClass: "OBSERVATION" },
      ],
      proposals: [
        {
          key: "gym-calendar",
          destination: "CALENDAR",
          operation: "CREATE_CALENDAR_PLAN",
          summary: "Add gym to Calendar",
          targetTrustClass: "FACT",
          approvalMode: "REVIEW_AND_APPLY",
          state: "READY_TO_APPLY",
          reason: "The fixture resolves an explicit Health plan.",
          payloadJson: {
            title: "Gym",
            startsAt: "2026-08-14T19:00:00.000Z",
            endsAt: "2026-08-14T20:00:00.000Z",
            category: "Health",
            commitment: "Important",
          },
        },
      ],
    };
  },
};

const tentativeInterpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "TENTATIVE",
      confidence: 0.78,
      observations: [
        { id: "tentative", label: "Certainty", value: "The plan is tentative", trustClass: "OBSERVATION" },
      ],
      clarification: "Should Saturday evening be reserved or kept only as a possibility?",
      proposals: [
        {
          key: "friend-calendar",
          destination: "CALENDAR",
          operation: "CREATE_CALENDAR_PLAN",
          summary: "Prepare a tentative Calendar plan",
          targetTrustClass: "FACT",
          approvalMode: "EXPLICIT_CONFIRMATION",
          state: "NEEDS_CONFIRMATION",
          reason: "The user has not committed to the visit yet.",
          payloadJson: {
            title: "Friend visit",
            category: "Friends",
            commitment: "Flexible",
          },
        },
      ],
    };
  },
};

before(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);

  for (const file of [
    "0001_write_boundary.sql",
    "0002_capture_routing_proposal.sql",
    "0003_proposal_creation_provenance.sql",
    "0004_row_level_authorization.sql",
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
    TRUNCATE TABLE routing_proposal, routing_interpretation, capture_record,
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

test("pending clarification becomes a user-readable no-write trace under RLS", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  const reader = new PostgresInteractionChangeLedgerReader(appPool);
  const routingIds = ids();
  let tick = 0;
  const clock = { now: () => new Date(Date.parse("2026-08-13T03:00:00.000Z") + ++tick * 1000).toISOString() };

  const receipt = await captureAndPropose(
    { rawText: "My friend may visit Saturday evening." },
    context("user-ledger", "capture-tentative", "2026-08-13T02:58:00.000Z"),
    { unitOfWork, interpreter: tentativeInterpreter, clock, ids: routingIds },
  );

  const trace = await getInteractionChangeTrace(
    receipt.captureId,
    { actorType: "USER", userId: "user-ledger" },
    { reader },
  );

  assert.ok(trace);
  assert.equal(trace.status, "NEEDS_USER");
  assert.equal(trace.source.text, "My friend may visit Saturday evening.");
  assert.equal(trace.interpretation?.authorityClass, "OBSERVATION");
  assert.equal(trace.proposals[0].authorityClass, "SUGGESTION");
  assert.equal(trace.proposals[0].canonicalChange, undefined);
  assert.deepEqual(trace.projectionEffects, { status: "NOT_RECORDED_YET", items: [] });

  const canonical = await ownerPool.query("SELECT id FROM calendar_event");
  const events = await ownerPool.query("SELECT event_id FROM domain_event");
  assert.equal(canonical.rowCount, 0);
  assert.equal(events.rowCount, 0);
});

test("applied Calendar proposal reconstructs source -> observation -> suggestion -> approval -> canonical event", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  const reader = new PostgresInteractionChangeLedgerReader(appPool);
  const routingIds = ids();
  const commitIds = ids();
  let tick = 0;
  const clock = { now: () => new Date(Date.parse("2026-08-13T03:10:00.000Z") + ++tick * 1000).toISOString() };

  const capture = await captureAndPropose(
    { rawText: "Gym tomorrow at 7" },
    context("user-ledger", "capture-confirmed", "2026-08-13T03:08:00.000Z"),
    { unitOfWork, interpreter: confirmedInterpreter, clock, ids: routingIds },
  );

  const applied = await applyCalendarPlanProposal(
    { proposalId: capture.proposalIds[0], confirmation: { explicit: true } },
    context("user-ledger", "apply-confirmed", "2026-08-13T03:12:00.000Z"),
    { unitOfWork, clock, ids: commitIds },
  );

  const trace = await getInteractionChangeTrace(
    capture.captureId,
    { actorType: "USER", userId: "user-ledger" },
    { reader },
  );

  assert.ok(trace);
  assert.equal(trace.status, "COMMITTED");
  assert.equal(trace.correlationId, capture.correlationId);
  assert.equal(trace.proposals[0].approval?.action, "APPROVED");
  assert.equal(trace.proposals[0].approval?.actorId, "user-ledger");
  assert.equal(trace.proposals[0].canonicalChange?.eventId, applied.eventId);
  assert.equal(trace.proposals[0].canonicalChange?.summary, "Calendar event created: Gym");
  assert.equal(trace.proposals[0].canonicalChange?.details?.category, "Health");
  assert.equal(trace.projectionEffects.status, "NOT_RECORDED_YET");

  const serialized = JSON.stringify(trace);
  assert.equal(serialized.includes("requestFingerprint"), false);
  assert.equal(serialized.includes("capture-confirmed"), false);

  const otherUser = await getInteractionChangeTrace(
    capture.captureId,
    { actorType: "USER", userId: "other-user" },
    { reader },
  );
  assert.equal(otherUser, undefined);

  const unscoped = await appPool.query("SELECT capture_id FROM capture_record");
  assert.equal(unscoped.rowCount, 0);
});
