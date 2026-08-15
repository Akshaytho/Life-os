import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { applyCalendarPlanProposal } from "./apply-calendar-plan-proposal";
import {
  CalendarProposalConfirmationError,
  confirmCalendarProposal,
} from "./confirm-calendar-proposal";
import { PostgresCalendarProposalConfirmationStore } from "./postgres-calendar-proposal-confirmation-store";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "calendar_proposal_confirmation_test";
const appRole = "lifeos_calendar_confirmation_test_app";
const appPassword = "lifeos_calendar_confirmation_test_password";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({ connectionString: appUrl.toString(), max: 4, options: `-c search_path=${schema}` });

function context(userId: string, requestId: string, receivedAt = "2026-08-15T18:30:00.000Z"): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt,
    requestId,
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
  ]) {
    await ownerPool.query(await readFile(`packages/database/migrations/${file}`, "utf8"));
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

  await ownerPool.query(
    `INSERT INTO capture_record
      (id, user_id, raw_text, source, actor_type, actor_id, received_at, request_id, correlation_id, capture_created_at)
     VALUES
      ('capture-confirm', 'user-a', 'Gym tomorrow at five', 'WEB_APP', 'USER', 'user-a',
       '2026-08-15T18:30:00.000Z', 'capture-request', 'correlation-confirm', '2026-08-15T18:30:01.000Z')`,
  );
  await ownerPool.query(
    `INSERT INTO routing_interpretation
      (interpretation_id, capture_id, user_id, interpreter, intent, certainty, confidence, observations_json, clarification, created_at)
     VALUES
      ('interpretation-confirm', 'capture-confirm', 'user-a', 'LIFE_OS_AI', 'DATED_PLAN', 'CONFIRMED', 0.9,
       '[{"id":"obs-1","label":"Plan","value":"Calendar plan","trustClass":"OBSERVATION"}]'::jsonb,
       'Confirm exact Calendar details.', '2026-08-15T18:30:02.000Z')`,
  );
  await ownerPool.query(
    `INSERT INTO routing_proposal
      (proposal_id, interpretation_id, capture_id, user_id, destination, operation, summary, target_trust_class,
       approval_mode, state, reason, payload_json, proposal_created_by_actor_type, proposal_created_by_actor_id,
       proposal_created_at, created_at)
     VALUES
      ('proposal-confirm', 'interpretation-confirm', 'capture-confirm', 'user-a', 'CALENDAR', 'CREATE_CALENDAR_PLAN',
       'Review gym Calendar plan', 'FACT', 'EXPLICIT_CONFIRMATION', 'NEEDS_CONFIRMATION',
       'AI interpretation requires user-confirmed Calendar details.',
       '{"title":"Gym","category":"Health"}'::jsonb,
       'USER', 'user-a', '2026-08-15T18:30:03.000Z', '2026-08-15T18:30:03.000Z')`,
  );
});

after(async () => {
  await appPool.end();
  await ownerPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.end();
});

test("least-privileged RLS flow confirms details before the existing Calendar Apply boundary", async () => {
  const store = new PostgresCalendarProposalConfirmationStore(appPool);
  const clock = { now: () => "2026-08-15T18:31:00.000Z" };

  await assert.rejects(
    () => confirmCalendarProposal(
      {
        proposalId: "proposal-confirm",
        plan: {
          title: "Gym",
          startsAt: "2026-08-16T17:00:00+05:30",
          endsAt: "2026-08-16T18:00:00+05:30",
          category: "Health",
          commitment: "Important",
          timeZone: "Asia/Kolkata",
        },
      },
      context("user-b", "confirm-wrong-user"),
      { store, clock },
    ),
    (error: unknown) => error instanceof CalendarProposalConfirmationError && error.code === "PROPOSAL_UNAVAILABLE",
  );

  const confirmed = await confirmCalendarProposal(
    {
      proposalId: "proposal-confirm",
      plan: {
        title: "Gym",
        startsAt: "2026-08-16T17:00:00+05:30",
        endsAt: "2026-08-16T18:00:00+05:30",
        category: "Health",
        commitment: "Important",
        timeZone: "Asia/Kolkata",
      },
    },
    context("user-a", "confirm-user-a"),
    { store, clock },
  );
  assert.equal(confirmed.state, "READY_TO_APPLY");
  assert.equal(confirmed.idempotentReplay, false);

  const replay = await confirmCalendarProposal(
    {
      proposalId: "proposal-confirm",
      plan: {
        title: "Gym",
        startsAt: "2026-08-16T17:00:00+05:30",
        endsAt: "2026-08-16T18:00:00+05:30",
        category: "Health",
        commitment: "Important",
        timeZone: "Asia/Kolkata",
      },
    },
    context("user-a", "confirm-user-a-retry"),
    { store, clock: { now: () => "2026-08-15T19:00:00.000Z" } },
  );
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.confirmedAt, confirmed.confirmedAt);

  const persisted = await ownerPool.query<{ state: string; payload_json: Record<string, unknown> }>(
    "SELECT state, payload_json FROM routing_proposal WHERE proposal_id = 'proposal-confirm'",
  );
  assert.equal(persisted.rows[0]?.state, "READY_TO_APPLY");
  assert.equal(persisted.rows[0]?.payload_json.title, "Gym");
  assert.equal(persisted.rows[0]?.payload_json.startsAt, "2026-08-16T11:30:00.000Z");
  assert.equal((persisted.rows[0]?.payload_json.confirmation as Record<string, unknown>).confirmedByActorId, "user-a");
  assert.deepEqual(
    (persisted.rows[0]?.payload_json.confirmation as Record<string, unknown>).interpretedPlan,
    { title: "Gym", category: "Health" },
  );

  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  let id = 0;
  const applied = await applyCalendarPlanProposal(
    { proposalId: "proposal-confirm", confirmation: { explicit: true } },
    context("user-a", "apply-confirmed", "2026-08-15T18:32:00.000Z"),
    {
      unitOfWork,
      clock: { now: () => "2026-08-15T18:32:01.000Z" },
      ids: { next: (prefix) => `${prefix}-confirmation-${++id}` },
    },
  );

  assert.equal(applied.idempotentReplay, false);
  const calendar = await ownerPool.query<{ user_id: string; title: string; starts_at: Date; source_proposal_id: string }>(
    "SELECT user_id, title, starts_at, source_proposal_id FROM calendar_event",
  );
  assert.equal(calendar.rows.length, 1);
  assert.equal(calendar.rows[0]?.user_id, "user-a");
  assert.equal(calendar.rows[0]?.title, "Gym");
  assert.equal(calendar.rows[0]?.starts_at.toISOString(), "2026-08-16T11:30:00.000Z");
  assert.equal(calendar.rows[0]?.source_proposal_id, "proposal-confirm");
});
