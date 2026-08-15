import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { PostgresDirectionDecisionUnitOfWork } from "../../../packages/database/postgres-direction-decision-unit-of-work";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import {
  activateDirectionDecision,
  DirectionDecisionError,
} from "./activate-direction-decision";
import { withWebWriteIdempotency } from "./web-write-idempotency";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "direction_decision_test";
const appRole = "lifeos_direction_decision_test_app";
const appPassword = "lifeos_direction_decision_test_password";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({ connectionString: appUrl.toString(), max: 6, options: `-c search_path=${schema}` });

function context(userId: string, idempotencyKey: string, receivedAt: string): WriteRequestContext {
  return withWebWriteIdempotency(
    {
      principal: { actorType: "USER", userId },
      source: "WEB_APP",
      receivedAt,
      requestId: "transport-request",
    },
    "DIRECTION_SET_CURRENT",
    idempotencyKey,
  );
}

function command(statement: string, expectedCurrentDirectionId: string | null) {
  return {
    statement,
    expectedCurrentDirectionId,
    approval: { explicit: true, acknowledgement: "SET_AS_CURRENT_DIRECTION" as const },
  };
}

function ids(namespace: string) {
  let direction = 0;
  let event = 0;
  return {
    next(prefix: "direction" | "event") {
      return prefix === "direction"
        ? `direction-${namespace}-${++direction}`
        : `event-${namespace}-${++event}`;
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
    "0006_safe_fallback_interpreter.sql",
    "0007_direction_decision.sql",
  ]) {
    await ownerPool.query(await readFile(`packages/database/migrations/${file}`, "utf8"));
  }

  await adminPool.query(
    `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  await adminPool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT SELECT, INSERT, UPDATE ON ${schema}.direction_decision TO ${appRole}`);
  await adminPool.query(`GRANT INSERT ON ${schema}.domain_event TO ${appRole}`);
  await adminPool.query(`GRANT EXECUTE ON FUNCTION ${schema}.lifeos_current_user_id() TO ${appRole}`);
});

beforeEach(async () => {
  await ownerPool.query("TRUNCATE TABLE direction_decision, domain_event CASCADE");
});

after(async () => {
  await appPool.end();
  await ownerPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.end();
});

test("least-privileged RLS transaction creates and supersedes Direction while preserving history and domain events", async () => {
  const unitOfWork = new PostgresDirectionDecisionUnitOfWork(appPool);
  const generator = ids("history");

  const first = await activateDirectionDecision(
    command("Build a self-reliant travel creator path while keeping my full-time job.", null),
    context("user-a", "direction-history-a-0001", "2026-08-16T20:00:00.000Z"),
    { unitOfWork, clock: { now: () => "2026-08-16T20:00:01.000Z" }, ids: generator },
  );
  const second = await activateDirectionDecision(
    command("Build the craft steadily and make travel films without abandoning real-life responsibilities.", first.directionId),
    context("user-a", "direction-history-b-0001", "2026-08-16T21:00:00.000Z"),
    { unitOfWork, clock: { now: () => "2026-08-16T21:00:01.000Z" }, ids: generator },
  );

  assert.equal(second.supersededDirectionId, first.directionId);

  const rows = await ownerPool.query<{
    direction_id: string;
    user_id: string;
    statement: string;
    status: string;
    ended_at: Date | null;
    supersedes_direction_id: string | null;
  }>(
    `SELECT direction_id, user_id, statement, status, ended_at, supersedes_direction_id
       FROM direction_decision
      WHERE user_id = 'user-a'
      ORDER BY decided_at`,
  );
  assert.equal(rows.rows.length, 2);
  assert.equal(rows.rows[0]?.status, "SUPERSEDED");
  assert.equal(rows.rows[0]?.ended_at?.toISOString(), "2026-08-16T21:00:01.000Z");
  assert.equal(rows.rows[1]?.status, "ACTIVE");
  assert.equal(rows.rows[1]?.supersedes_direction_id, first.directionId);
  assert.equal(rows.rows.every((row) => row.user_id === "user-a"), true);

  const events = await ownerPool.query<{
    actor_type: string;
    actor_id: string | null;
    event_type: string;
    entity_type: string;
    payload_json: Record<string, unknown>;
  }>(
    "SELECT actor_type, actor_id, event_type, entity_type, payload_json FROM domain_event ORDER BY recorded_at",
  );
  assert.equal(events.rows.length, 2);
  assert.equal(events.rows.every((event) => event.actor_type === "USER" && event.actor_id === "user-a"), true);
  assert.equal(events.rows.every((event) => event.event_type === "DIRECTION_DECISION_ACTIVATED"), true);
  assert.equal(events.rows.every((event) => event.entity_type === "direction_decision"), true);
  assert.equal(events.rows[1]?.payload_json.supersededDirectionId, first.directionId);
});

test("stale expected-current version is rejected transactionally without superseding the newer Direction", async () => {
  const unitOfWork = new PostgresDirectionDecisionUnitOfWork(appPool);
  const generator = ids("stale");
  const first = await activateDirectionDecision(
    command("Direction A", null),
    context("user-a", "direction-stale-a-0001", "2026-08-16T20:00:00.000Z"),
    { unitOfWork, clock: { now: () => "2026-08-16T20:00:01.000Z" }, ids: generator },
  );
  await activateDirectionDecision(
    command("Direction B", first.directionId),
    context("user-a", "direction-stale-b-0001", "2026-08-16T21:00:00.000Z"),
    { unitOfWork, clock: { now: () => "2026-08-16T21:00:01.000Z" }, ids: generator },
  );

  await assert.rejects(
    () => activateDirectionDecision(
      command("Direction C from stale tab", first.directionId),
      context("user-a", "direction-stale-c-0001", "2026-08-16T22:00:00.000Z"),
      { unitOfWork, clock: { now: () => "2026-08-16T22:00:01.000Z" }, ids: generator },
    ),
    (error: unknown) => error instanceof DirectionDecisionError && error.code === "CURRENT_DIRECTION_CHANGED",
  );

  const active = await ownerPool.query<{ statement: string }>(
    "SELECT statement FROM direction_decision WHERE user_id = 'user-a' AND status = 'ACTIVE'",
  );
  assert.deepEqual(active.rows.map((row) => row.statement), ["Direction B"]);
  const eventCount = await ownerPool.query<{ count: string }>("SELECT count(*)::text AS count FROM domain_event");
  assert.equal(eventCount.rows[0]?.count, "2");
});

test("advisory serialization allows only one concurrent replacement of the same expected Direction", async () => {
  const unitOfWork = new PostgresDirectionDecisionUnitOfWork(appPool);
  const initial = await activateDirectionDecision(
    command("Direction A", null),
    context("user-a", "direction-race-initial-0001", "2026-08-16T20:00:00.000Z"),
    { unitOfWork, clock: { now: () => "2026-08-16T20:00:01.000Z" }, ids: ids("race-initial") },
  );

  const attempts = await Promise.allSettled([
    activateDirectionDecision(
      command("Direction B", initial.directionId),
      context("user-a", "direction-race-b-0001", "2026-08-16T21:00:00.000Z"),
      { unitOfWork, clock: { now: () => "2026-08-16T21:00:01.000Z" }, ids: ids("race-b") },
    ),
    activateDirectionDecision(
      command("Direction C", initial.directionId),
      context("user-a", "direction-race-c-0001", "2026-08-16T21:00:00.000Z"),
      { unitOfWork, clock: { now: () => "2026-08-16T21:00:01.000Z" }, ids: ids("race-c") },
    ),
  ]);

  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  const rejection = attempts.find((attempt) => attempt.status === "rejected");
  assert.ok(rejection && rejection.status === "rejected");
  assert.ok(rejection.reason instanceof DirectionDecisionError);
  assert.equal(rejection.reason.code, "CURRENT_DIRECTION_CHANGED");

  const active = await ownerPool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM direction_decision WHERE user_id = 'user-a' AND status = 'ACTIVE'",
  );
  assert.equal(active.rows[0]?.count, "1");
});

test("same browser Idempotency-Key is user-isolated and RLS prevents cross-user supersession", async () => {
  const unitOfWork = new PostgresDirectionDecisionUnitOfWork(appPool);
  const sharedKey = "direction-shared-key-0001";
  const contextA = context("user-a", sharedKey, "2026-08-16T20:00:00.000Z");
  const contextB = context("user-b", sharedKey, "2026-08-16T20:00:00.000Z");
  assert.notEqual(contextA.requestId, contextB.requestId);

  const userA = await activateDirectionDecision(
    command("User A direction", null),
    contextA,
    { unitOfWork, clock: { now: () => "2026-08-16T20:00:01.000Z" }, ids: ids("user-a") },
  );
  const userB = await activateDirectionDecision(
    command("User B direction", null),
    contextB,
    { unitOfWork, clock: { now: () => "2026-08-16T20:00:01.000Z" }, ids: ids("user-b") },
  );

  assert.notEqual(userA.directionId, userB.directionId);

  await assert.rejects(
    () => activateDirectionDecision(
      command("User B must not supersede User A", userA.directionId),
      context("user-b", "direction-cross-user-0001", "2026-08-16T21:00:00.000Z"),
      { unitOfWork, clock: { now: () => "2026-08-16T21:00:01.000Z" }, ids: ids("cross-user") },
    ),
    (error: unknown) => error instanceof DirectionDecisionError && error.code === "CURRENT_DIRECTION_CHANGED",
  );

  const active = await ownerPool.query<{ user_id: string; statement: string }>(
    "SELECT user_id, statement FROM direction_decision WHERE status = 'ACTIVE' ORDER BY user_id",
  );
  assert.deepEqual(active.rows, [
    { user_id: "user-a", statement: "User A direction" },
    { user_id: "user-b", statement: "User B direction" },
  ]);
});
