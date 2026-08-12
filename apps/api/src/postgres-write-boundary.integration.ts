import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type {
  ApplyStoredProposalCommand,
  Clock,
  IdGenerator,
  RoutingIdGenerator,
  WriteRequestContext,
} from "../../../packages/domain/write-boundary";
import type {
  CaptureInterpretationResult,
  CaptureInterpreter,
  CaptureInterpreterInput,
} from "../../../packages/intelligence/capture-interpreter";
import { applyCalendarPlanProposal, ProposalValidationError } from "./apply-calendar-plan-proposal";
import { captureAndPropose, CaptureProposalPersistenceError } from "./capture-and-propose";

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
    if (prefix === "calendar") return `calendar-pg-${++this.calendarIndex}`;
    return `event-pg-${++this.eventIndex}`;
  }
}

class FixedRoutingIds implements RoutingIdGenerator {
  private captureIndex = 0;
  private interpretationIndex = 0;
  private proposalIndex = 0;

  next(prefix: "capture" | "interpretation" | "proposal") {
    if (prefix === "capture") return `capture-created-${++this.captureIndex}`;
    if (prefix === "interpretation") return `interpretation-created-${++this.interpretationIndex}`;
    return `proposal-created-${++this.proposalIndex}`;
  }
}

function routingInterpretation(): CaptureInterpretationResult {
  return {
    interpreter: "LIFE_OS_AI",
    intent: "DATED_PLAN",
    certainty: "CONFIRMED",
    confidence: 0.94,
    observations: [
      { id: "intent", label: "Intent", value: "Confirmed health plan", trustClass: "OBSERVATION" },
    ],
    proposals: [
      {
        key: "calendar-plan",
        destination: "CALENDAR",
        operation: "CREATE_CALENDAR_PLAN",
        summary: "Create the reviewed gym plan.",
        targetTrustClass: "FACT",
        approvalMode: "REVIEW_AND_APPLY",
        state: "READY_TO_APPLY",
        reason: "Calendar owns the time-bound plan.",
        payloadJson: {
          title: "Gym",
          startsAt: "2026-08-13T13:30:00.000Z",
          endsAt: "2026-08-13T14:30:00.000Z",
          category: "Health",
          commitment: "Important",
        },
      },
      {
        key: "decision-history",
        destination: "MEMORY",
        operation: "RECORD_DECISION",
        summary: "Preserve that the dated plan was explicitly decided.",
        targetTrustClass: "DECISION",
        approvalMode: "REVIEW_AND_APPLY",
        state: "READY_TO_APPLY",
        reason: "Decision history remains distinct from the Calendar projection.",
        payloadJson: { decisionKind: "dated-plan" },
      },
    ],
  };
}

class IntegrationInterpreter implements CaptureInterpreter {
  calls: CaptureInterpreterInput[] = [];

  async interpret(input: CaptureInterpreterInput): Promise<CaptureInterpretationResult> {
    this.calls.push({ ...input });
    return routingInterpretation();
  }
}

class BarrierInterpreter implements CaptureInterpreter {
  calls: CaptureInterpreterInput[] = [];
  private arrivals = 0;
  private releaseGate!: () => void;
  private readonly gate = new Promise<void>((resolve) => { this.releaseGate = resolve; });

  async interpret(input: CaptureInterpreterInput): Promise<CaptureInterpretationResult> {
    this.calls.push({ ...input });
    this.arrivals += 1;
    if (this.arrivals === 2) this.releaseGate();
    await this.gate;
    return routingInterpretation();
  }
}

function command(): ApplyStoredProposalCommand {
  return { proposalId: "proposal-postgres-1", confirmation: { explicit: true } };
}

function context(userId = "user-pg-1", requestId = "request-pg-1", receivedAt = "2026-08-12T18:59:58.000Z"): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt,
    requestId,
  };
}

async function seedProposal(options: { userId?: string; title?: string; state?: string } = {}) {
  const userId = options.userId ?? "user-pg-1";
  await pool.query(
    `INSERT INTO capture_record
      (capture_id, user_id, raw_text, source, correlation_id, request_id, received_at, recorded_at)
     VALUES ('capture-postgres-1', $1, 'Gym tomorrow at 7 PM.', 'WEB_APP', 'correlation-postgres-1',
             'seed-request', '2026-08-12T18:19:58.000Z', '2026-08-12T18:20:00.000Z')`,
    [userId],
  );
  await pool.query(
    `INSERT INTO routing_proposal
      (proposal_id, interpreter_proposal_key, user_id, capture_id, destination, operation,
       summary, target_trust_class, approval_mode, state, reason, payload_json, created_at)
     VALUES ('proposal-postgres-1', 'seed-calendar-plan', $1, 'capture-postgres-1',
             'CALENDAR', 'CREATE_CALENDAR_PLAN', 'Seeded Calendar plan', 'FACT',
             'REVIEW_AND_APPLY', $2, 'Deterministic integration seed', $3::jsonb,
             '2026-08-12T18:21:00.000Z')`,
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
    DROP TRIGGER IF EXISTS force_proposal_failure ON routing_proposal;
    DROP TRIGGER IF EXISTS force_second_proposal_failure ON routing_proposal;
    DROP FUNCTION IF EXISTS reject_applied_proposal_update();
    DROP FUNCTION IF EXISTS reject_second_routing_proposal();
    TRUNCATE TABLE routing_proposal, routing_interpretation, capture_record,
      applied_proposal, domain_event, calendar_event CASCADE;
  `);
});

after(async () => { await pool.end(); });

test("PostgreSQL persists Capture, interpretation and proposals without creating canonical life state", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  const interpreter = new IntegrationInterpreter();
  const receipt = await captureAndPropose(
    { rawText: "Gym tomorrow at 7 PM." },
    context("user-pg-1", "capture-create-request"),
    { unitOfWork, interpreter, clock: new FixedClock(), ids: new FixedRoutingIds() },
  );

  const [captures, interpretations, proposals, calendar, events] = await Promise.all([
    pool.query("SELECT * FROM capture_record"),
    pool.query("SELECT * FROM routing_interpretation"),
    pool.query("SELECT * FROM routing_proposal ORDER BY proposal_id"),
    pool.query("SELECT * FROM calendar_event"),
    pool.query("SELECT * FROM domain_event"),
  ]);

  assert.equal(receipt.idempotentReplay, false);
  assert.equal(captures.rowCount, 1);
  assert.equal(captures.rows[0].raw_text, "Gym tomorrow at 7 PM.");
  assert.equal(captures.rows[0].request_id, "capture-create-request");
  assert.equal(captures.rows[0].received_at.toISOString(), "2026-08-12T18:59:58.000Z");
  assert.equal(interpretations.rowCount, 1);
  assert.equal(interpretations.rows[0].interpreter, "LIFE_OS_AI");
  assert.equal(proposals.rowCount, 2);
  assert.equal(proposals.rows[0].interpretation_id, interpretations.rows[0].interpretation_id);
  assert.equal(proposals.rows[0].capture_id, captures.rows[0].capture_id);
  assert.equal(calendar.rowCount, 0);
  assert.equal(events.rowCount, 0);
});

test("PostgreSQL Capture request replay reuses original records and skips reinterpretation", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  const interpreter = new IntegrationInterpreter();
  const deps = { unitOfWork, interpreter, clock: new FixedClock(), ids: new FixedRoutingIds() };

  const first = await captureAndPropose(
    { rawText: "Gym tomorrow at 7 PM." },
    context("user-pg-1", "same-capture-request"),
    deps,
  );
  const second = await captureAndPropose(
    { rawText: "Gym tomorrow at 7 PM." },
    context("user-pg-1", "same-capture-request", "2026-08-13T20:00:00.000Z"),
    deps,
  );

  assert.equal(second.idempotentReplay, true);
  assert.equal(second.captureId, first.captureId);
  assert.deepEqual(second.proposalIds, first.proposalIds);
  assert.equal(interpreter.calls.length, 1);

  const counts = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM capture_record) AS capture_count,
      (SELECT count(*)::int FROM routing_interpretation) AS interpretation_count,
      (SELECT count(*)::int FROM routing_proposal) AS proposal_count
  `);
  assert.deepEqual(counts.rows[0], { capture_count: 1, interpretation_count: 1, proposal_count: 2 });
});

test("simultaneous Capture retries serialize on the stored Capture and share one proposal bundle", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  const interpreter = new BarrierInterpreter();
  const request = context("user-pg-1", "concurrent-capture-request");

  const [first, second] = await Promise.all([
    captureAndPropose(
      { rawText: "Gym tomorrow at 7 PM." },
      request,
      { unitOfWork, interpreter, clock: new FixedClock(), ids: new FixedRoutingIds() },
    ),
    captureAndPropose(
      { rawText: "Gym tomorrow at 7 PM." },
      request,
      { unitOfWork, interpreter, clock: new FixedClock(), ids: new FixedRoutingIds() },
    ),
  ]);

  assert.equal(first.captureId, second.captureId);
  assert.equal(first.interpretationId, second.interpretationId);
  assert.deepEqual(first.proposalIds, second.proposalIds);
  assert.deepEqual([first.idempotentReplay, second.idempotentReplay].sort(), [false, true]);
  assert.equal(interpreter.calls.length, 2);

  const counts = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM capture_record) AS capture_count,
      (SELECT count(*)::int FROM routing_interpretation) AS interpretation_count,
      (SELECT count(*)::int FROM routing_proposal) AS proposal_count
  `);
  assert.deepEqual(counts.rows[0], { capture_count: 1, interpretation_count: 1, proposal_count: 2 });
});

test("PostgreSQL rejects request-id reuse with different raw Capture content", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  const interpreter = new IntegrationInterpreter();
  const deps = { unitOfWork, interpreter, clock: new FixedClock(), ids: new FixedRoutingIds() };

  await captureAndPropose({ rawText: "Original words" }, context("user-pg-1", "collision-request"), deps);
  await assert.rejects(
    () => captureAndPropose({ rawText: "Different words" }, context("user-pg-1", "collision-request"), deps),
    (error: unknown) => error instanceof CaptureProposalPersistenceError && /different Capture content/.test(error.message),
  );

  const capture = await pool.query("SELECT raw_text FROM capture_record WHERE request_id = 'collision-request'");
  assert.equal(capture.rows[0].raw_text, "Original words");
});

test("PostgreSQL rolls back the whole interpretation/proposal bundle while preserving Capture", async () => {
  await pool.query(`
    CREATE OR REPLACE FUNCTION reject_second_routing_proposal() RETURNS trigger AS $$
    BEGIN
      IF NEW.interpreter_proposal_key = 'decision-history' THEN
        RAISE EXCEPTION 'forced second routing proposal failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER force_second_proposal_failure BEFORE INSERT ON routing_proposal
    FOR EACH ROW EXECUTE FUNCTION reject_second_routing_proposal();
  `);

  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  await assert.rejects(
    () => captureAndPropose(
      { rawText: "Gym tomorrow at 7 PM." },
      context("user-pg-1", "proposal-failure-request"),
      { unitOfWork, interpreter: new IntegrationInterpreter(), clock: new FixedClock(), ids: new FixedRoutingIds() },
    ),
    /forced second routing proposal failure/,
  );

  const counts = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM capture_record) AS capture_count,
      (SELECT count(*)::int FROM routing_interpretation) AS interpretation_count,
      (SELECT count(*)::int FROM routing_proposal) AS proposal_count
  `);
  assert.deepEqual(counts.rows[0], { capture_count: 1, interpretation_count: 0, proposal_count: 0 });
});

test("a proposal created from Capture can later be applied through the same persisted record", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(pool);
  const created = await captureAndPropose(
    { rawText: "Gym tomorrow at 7 PM." },
    context("user-pg-1", "bridge-capture-request"),
    { unitOfWork, interpreter: new IntegrationInterpreter(), clock: new FixedClock(), ids: new FixedRoutingIds() },
  );

  const applied = await applyCalendarPlanProposal(
    { proposalId: created.proposalIds[0], confirmation: { explicit: true } },
    context("user-pg-1", "bridge-apply-request", "2026-08-12T19:05:00.000Z"),
    { unitOfWork, clock: new FixedClock(), ids: new FixedIds() },
  );

  const [calendar, event, proposal, marker] = await Promise.all([
    pool.query("SELECT * FROM calendar_event WHERE id = $1", [applied.entityId]),
    pool.query("SELECT * FROM domain_event WHERE event_id = $1", [applied.eventId]),
    pool.query("SELECT * FROM routing_proposal WHERE proposal_id = $1", [created.proposalIds[0]]),
    pool.query("SELECT * FROM applied_proposal WHERE proposal_id = $1", [created.proposalIds[0]]),
  ]);

  assert.equal(calendar.rows[0].title, "Gym");
  assert.equal(calendar.rows[0].user_id, "user-pg-1");
  assert.equal(event.rows[0].payload_json.captureId, created.captureId);
  assert.equal("sourceText" in event.rows[0].payload_json, false);
  assert.equal(proposal.rows[0].state, "APPLIED");
  assert.equal(marker.rowCount, 1);
});

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

test("PostgreSQL exact Apply replay returns original receipt without duplicate writes", async () => {
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

test("PostgreSQL rollback restores stored proposal state if final Apply status update fails", async () => {
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
