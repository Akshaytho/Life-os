import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type {
  ApplyCalendarPlanProposalCommand,
  CalendarPlanRecord,
  Clock,
  DomainEventRecord,
  IdGenerator,
} from "../../../packages/domain/write-boundary";
import { applyCalendarPlanProposal } from "./apply-calendar-plan-proposal";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const pool = new Pool({ connectionString: databaseUrl, max: 4 });

class FixedClock implements Clock {
  now() { return "2026-08-12T19:00:00.000Z"; }
}

class FixedIds implements IdGenerator {
  private calendarIndex = 0;
  private eventIndex = 0;

  next(prefix: "calendar" | "event") {
    if (prefix === "calendar") {
      this.calendarIndex += 1;
      return `calendar-pg-${this.calendarIndex}`;
    }
    this.eventIndex += 1;
    return `event-pg-${this.eventIndex}`;
  }
}

function command(): ApplyCalendarPlanProposalCommand {
  return {
    proposalId: "proposal-postgres-1",
    proposalState: "READY_TO_APPLY",
    approvalMode: "REVIEW_AND_APPLY",
    destination: "CALENDAR",
    operation: "CREATE_CALENDAR_PLAN",
    sourceText: "Gym tomorrow at 7 PM.",
    correlationId: "capture-postgres-1",
    source: "WEB_APP",
    confirmation: {
      actorType: "USER",
      actorId: "user-pg-1",
      confirmedAt: "2026-08-12T18:59:58.000Z",
      explicit: true,
    },
    plan: {
      title: "Gym",
      startsAt: "2026-08-13T13:30:00.000Z",
      endsAt: "2026-08-13T14:30:00.000Z",
      category: "Health",
      commitment: "Important",
    },
  };
}

before(async () => {
  const migration = await readFile("packages/database/migrations/0001_write_boundary.sql", "utf8");
  await pool.query(migration);
});

beforeEach(async () => {
  await pool.query("TRUNCATE TABLE applied_proposal, domain_event, calendar_event CASCADE");
});

after(async () => { await pool.end(); });

test("PostgreSQL commits canonical state, event and applied marker together", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  const receipt = await applyCalendarPlanProposal(command(), {
    unitOfWork,
    clock: new FixedClock(),
    ids: new FixedIds(),
  });

  const [calendar, events, applied] = await Promise.all([
    pool.query("SELECT * FROM calendar_event"),
    pool.query("SELECT * FROM domain_event"),
    pool.query("SELECT * FROM applied_proposal"),
  ]);

  assert.equal(receipt.idempotentReplay, false);
  assert.equal(calendar.rowCount, 1);
  assert.equal(events.rowCount, 1);
  assert.equal(applied.rowCount, 1);
  assert.equal(calendar.rows[0].id, receipt.entityId);
  assert.equal(calendar.rows[0].user_id, "user-pg-1");
  assert.equal(events.rows[0].entity_id, receipt.entityId);
  assert.equal(events.rows[0].event_id, receipt.eventId);
  assert.equal(events.rows[0].actor_type, "USER");
  assert.equal(events.rows[0].actor_id, "user-pg-1");
  assert.equal(events.rows[0].correlation_id, "capture-postgres-1");
  assert.equal(events.rows[0].payload_json.proposalId, "proposal-postgres-1");
  assert.equal("sourceText" in events.rows[0].payload_json, false);
  assert.equal(applied.rows[0].request_fingerprint.length, 64);
});

test("PostgreSQL exact replay is idempotent", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  const dependencies = { unitOfWork, clock: new FixedClock(), ids: new FixedIds() };

  const first = await applyCalendarPlanProposal(command(), dependencies);
  const second = await applyCalendarPlanProposal(command(), dependencies);

  assert.equal(second.idempotentReplay, true);
  assert.equal(second.entityId, first.entityId);
  assert.equal(second.eventId, first.eventId);

  const counts = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM calendar_event) AS calendar_count,
      (SELECT count(*)::int FROM domain_event) AS event_count,
      (SELECT count(*)::int FROM applied_proposal) AS applied_count
  `);

  assert.deepEqual(counts.rows[0], { calendar_count: 1, event_count: 1, applied_count: 1 });
});

test("PostgreSQL rolls back a canonical row when a later event insert violates schema", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(pool);

  const plan: CalendarPlanRecord = {
    id: "calendar-rollback-proof",
    userId: "user-pg-1",
    title: "Rollback proof",
    startsAt: "2026-08-14T10:00:00.000Z",
    endsAt: "2026-08-14T11:00:00.000Z",
    category: "Personal",
    commitment: "Flexible",
    createdAt: "2026-08-12T19:00:00.000Z",
    sourceProposalId: "proposal-rollback-proof",
  };

  const invalidEvent = {
    eventId: "event-rollback-proof",
    userId: plan.userId,
    occurredAt: "2026-08-12T18:59:58.000Z",
    recordedAt: "2026-08-12T19:00:00.000Z",
    actorType: "NOT_A_VALID_ACTOR",
    actorId: plan.userId,
    eventType: "CALENDAR_EVENT_CREATED",
    entityType: "calendar_event",
    entityId: plan.id,
    source: "WEB_APP",
    correlationId: "capture-rollback-proof",
    payloadJson: { proposalId: plan.sourceProposalId },
    schemaVersion: 1,
  } as unknown as DomainEventRecord;

  await assert.rejects(
    () => unitOfWork.run(async (transaction) => {
      await transaction.createCalendarPlan(plan);
      await transaction.appendDomainEvent(invalidEvent);
    }),
    /domain_event_actor_type_check/,
  );

  const calendar = await pool.query("SELECT id FROM calendar_event WHERE id = $1", [plan.id]);
  const events = await pool.query("SELECT event_id FROM domain_event WHERE event_id = $1", [invalidEvent.eventId]);
  assert.equal(calendar.rowCount, 0);
  assert.equal(events.rowCount, 0);
});
