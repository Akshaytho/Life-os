import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { ApplyStoredProposalCommand, Clock, IdGenerator, WriteRequestContext } from "../../../packages/domain/write-boundary";
import { applyCalendarPlanProposal, ProposalValidationError } from "./apply-calendar-plan-proposal";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
const pool = new Pool({ connectionString: databaseUrl, max: 4 });

class FixedClock implements Clock { now() { return "2026-08-12T19:00:00.000Z"; } }
class FixedIds implements IdGenerator {
  private calendarIndex = 0;
  private eventIndex = 0;
  next(prefix: "calendar" | "event") {
    if (prefix === "calendar") return `calendar-pg-${++this.calendarIndex}`;
    return `event-pg-${++this.eventIndex}`;
  }
}

function command(): ApplyStoredProposalCommand {
  return { proposalId: "proposal-postgres-1", confirmation: { explicit: true } };
}

function context(userId = "user-pg-1", requestId = "request-pg-1"): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt: "2026-08-12T18:59:58.000Z",
    requestId,
  };
}

async function seedProposal(options: { userId?: string; title?: string; state?: string } = {}) {
  const userId = options.userId ?? "user-pg-1";
  await pool.query(
    `INSERT INTO capture_record (capture_id, user_id, raw_text, source, correlation_id, recorded_at)
     VALUES ('capture-postgres-1', $1, 'Gym tomorrow at 7 PM.', 'WEB_APP', 'correlation-postgres-1', '2026-08-12T18:20:00.000Z')`,
    [userId],
  );
  await pool.query(
    `INSERT INTO routing_proposal
      (proposal_id, user_id, capture_id, destination, operation, approval_mode, state, payload_json, created_at)
     VALUES ('proposal-postgres-1', $1, 'capture-postgres-1', 'CALENDAR', 'CREATE_CALENDAR_PLAN',
             'REVIEW_AND_APPLY', $2, $3::jsonb, '2026-08-12T18:21:00.000Z')`,
    [
      userId,
      options.state ?? "READY_TO_APPLY",
      JSON.stringify({
        title: options.title ?? "Gym",
        startsAt: "2026-08-13T13:30:00.000Z",
        endsAt: "2026-08-13T14:30:00.000Z",
        category: "Health",
        commitment: "Important",
      }),
    ],
  );
}

before(async () => {
  for (const file of ["0001_write_boundary.sql", "0002_capture_routing_proposal.sql"]) {
    const migration = await readFile(`packages/database/migrations/${file}`, "utf8");
    await pool.query(migration);
  }
});

beforeEach(async () => {
  await pool.query("TRUNCATE TABLE routing_proposal, capture_record, applied_proposal, domain_event, calendar_event CASCADE");
});

after(async () => { await pool.end(); });

test("PostgreSQL applies only the persisted proposal and marks it APPLIED", async () => {
  await seedProposal();
  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  const receipt = await applyCalendarPlanProposal(command(), context(), {
    unitOfWork,
    clock: new FixedClock(),
    ids: new FixedIds(),
  });

  const [calendar, events, applied, proposal] = await Promise.all([
    pool.query("SELECT * FROM calendar_event"),
    pool.query("SELECT * FROM domain_event"),
    pool.query("SELECT * FROM applied_proposal"),
    pool.query("SELECT * FROM routing_proposal"),
  ]);

  assert.equal(receipt.idempotentReplay, false);
  assert.equal(calendar.rowCount, 1);
  assert.equal(calendar.rows[0].title, "Gym");
  assert.equal(calendar.rows[0].user_id, "user-pg-1");
  assert.equal(events.rowCount, 1);
  assert.equal(events.rows[0].actor_id, "user-pg-1");
  assert.equal(events.rows[0].payload_json.captureId, "capture-postgres-1");
  assert.equal("sourceText" in events.rows[0].payload_json, false);
  assert.equal(applied.rowCount, 1);
  assert.equal(proposal.rows[0].state, "APPLIED");
  assert.equal(proposal.rows[0].applied_entity_id, receipt.entityId);
  assert.equal(proposal.rows[0].applied_event_id, receipt.eventId);
});

test("PostgreSQL exact replay returns original receipt without duplicate writes", async () => {
  await seedProposal();
  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  const deps = { unitOfWork, clock: new FixedClock(), ids: new FixedIds() };

  const first = await applyCalendarPlanProposal(command(), context("user-pg-1", "request-first"), deps);
  const second = await applyCalendarPlanProposal(command(), context("user-pg-1", "request-retry"), deps);

  assert.equal(second.idempotentReplay, true);
  assert.equal(second.entityId, first.entityId);
  const counts = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM calendar_event) AS calendar_count,
      (SELECT count(*)::int FROM domain_event) AS event_count,
      (SELECT count(*)::int FROM applied_proposal) AS applied_count
  `);
  assert.deepEqual(counts.rows[0], { calendar_count: 1, event_count: 1, applied_count: 1 });
});

test("PostgreSQL will not expose another user's stored proposal to Apply", async () => {
  await seedProposal({ userId: "owner-user" });
  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  await assert.rejects(
    () => applyCalendarPlanProposal(command(), context("attacker-user"), { unitOfWork, clock: new FixedClock(), ids: new FixedIds() }),
    (error: unknown) => error instanceof ProposalValidationError && /unavailable/.test(error.message),
  );
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM calendar_event")).rows[0].count, 0);
});

test("PostgreSQL rollback restores stored proposal state if final status update fails", async () => {
  await seedProposal();
  await pool.query(`
    CREATE OR REPLACE FUNCTION reject_applied_proposal_update() RETURNS trigger AS $$
    BEGIN
      IF NEW.state = 'APPLIED' THEN RAISE EXCEPTION 'forced routing proposal update failure'; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER force_proposal_failure BEFORE UPDATE ON routing_proposal
    FOR EACH ROW EXECUTE FUNCTION reject_applied_proposal_update();
  `);

  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  await assert.rejects(
    () => applyCalendarPlanProposal(command(), context(), { unitOfWork, clock: new FixedClock(), ids: new FixedIds() }),
    /forced routing proposal update failure/,
  );

  await pool.query("DROP TRIGGER force_proposal_failure ON routing_proposal; DROP FUNCTION reject_applied_proposal_update();");
  const [calendar, events, applied, proposal] = await Promise.all([
    pool.query("SELECT count(*)::int AS count FROM calendar_event"),
    pool.query("SELECT count(*)::int AS count FROM domain_event"),
    pool.query("SELECT count(*)::int AS count FROM applied_proposal"),
    pool.query("SELECT state FROM routing_proposal WHERE proposal_id = 'proposal-postgres-1'"),
  ]);
  assert.equal(calendar.rows[0].count, 0);
  assert.equal(events.rows[0].count, 0);
  assert.equal(applied.rows[0].count, 0);
  assert.equal(proposal.rows[0].state, "READY_TO_APPLY");
});
