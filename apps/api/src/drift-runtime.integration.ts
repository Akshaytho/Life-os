import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { PostgresDriftReader } from "../../../packages/database/postgres-drift-reader";
import { PostgresDriftUnitOfWork } from "../../../packages/database/postgres-drift-unit-of-work";
import { PostgresUserScope } from "../../../packages/database/postgres-user-scope";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { applyApplicationDatabaseRole } from "./application-db-role";
import { confirmDriftUnderstanding } from "./confirm-drift-understanding";
import { createDriftDatabaseReadinessProbe } from "./drift-database-readiness";
import {
  applyDriftDatabaseRole,
  planDriftDatabaseRole,
  revokeDriftDatabaseRole,
} from "./drift-db-role";
import { getDriftOverview } from "./get-drift-overview";
import { applyDatabaseMigrations } from "./migration-runner";
import { recordDrift } from "./record-drift";
import { recordDriftReturn } from "./record-drift-return";
import { withWebWriteIdempotency, type WebWriteIdempotencyScope } from "./web-write-idempotency";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "drift_runtime_test";
const roleName = "lifeos_drift_return_it";
const password = "Synthetic-Drift-Password-2026!";
const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const migrationPool = new Pool({
  connectionString: databaseUrl,
  max: 4,
  options: `-c search_path=${schema}`,
});

function applicationPool() {
  const url = new URL(databaseUrl!);
  url.username = roleName;
  url.password = password;
  return new Pool({ connectionString: url.toString(), max: 6, options: `-c search_path=${schema}` });
}

before(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${roleName}`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);
});

after(async () => {
  await migrationPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${roleName}`);
  await adminPool.end();
});

function context(
  scope: WebWriteIdempotencyScope,
  key: string,
  receivedAt: string,
): WriteRequestContext {
  return withWebWriteIdempotency({
    principal: { actorType: "USER", userId: "user-a" },
    source: "WEB_APP",
    receivedAt,
    requestId: "transport-request",
  }, scope, key);
}

function ids() {
  let value = 0;
  return {
    next(prefix: "drift" | "drift-decision" | "event") {
      return `${prefix}-runtime-${++value}`;
    },
  };
}

test("Drift is separately granted, RLS-scoped, versioned, replay-safe, and revocable", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);
  const appPool = applicationPool();
  try {
    const readiness = createDriftDatabaseReadinessProbe(appPool);
    assert.equal(await readiness.check(), false);

    const beforeGrant = await planDriftDatabaseRole(migrationPool, roleName);
    assert.equal(beforeGrant.baselineRoleReady, true);
    assert.equal(beforeGrant.tableCount, 2);
    assert.equal(beforeGrant.protectedTableCount, 2);
    assert.equal(beforeGrant.nonOwnerTableCount, 2);
    assert.equal(beforeGrant.leastPrivilegeTableCount, 0);
    assert.equal(beforeGrant.ready, false);

    const granted = await applyDriftDatabaseRole(migrationPool, roleName);
    assert.equal(granted.ready, true);
    assert.equal(await readiness.check(), true);

    const privileges = await appPool.query(`
      SELECT
        has_table_privilege(current_user, 'drift_occurrence', 'SELECT') AS occurrence_select,
        has_table_privilege(current_user, 'drift_occurrence', 'INSERT') AS occurrence_insert,
        has_table_privilege(current_user, 'drift_occurrence', 'UPDATE') AS occurrence_update,
        has_table_privilege(current_user, 'drift_occurrence', 'DELETE') AS occurrence_delete,
        has_table_privilege(current_user, 'drift_decision', 'SELECT') AS decision_select,
        has_table_privilege(current_user, 'drift_decision', 'INSERT') AS decision_insert,
        has_table_privilege(current_user, 'drift_decision', 'UPDATE') AS decision_update,
        has_table_privilege(current_user, 'drift_decision', 'DELETE') AS decision_delete
    `);
    assert.deepEqual(privileges.rows[0], {
      occurrence_select: true,
      occurrence_insert: true,
      occurrence_update: false,
      occurrence_delete: false,
      decision_select: true,
      decision_insert: true,
      decision_update: true,
      decision_delete: false,
    });
    await assert.rejects(() => appPool.query("DELETE FROM drift_occurrence"), /permission denied/i);
    await assert.rejects(() => appPool.query(`
      INSERT INTO drift_occurrence
        (drift_id, user_id, source, correlation_id, request_id, request_fingerprint, occurred_at, recorded_at)
      VALUES ('forged', 'user-a', 'WEB_APP', 'forged', 'forged', repeat('f', 64), now(), now())
    `), /row-level security/i);

    const unitOfWork = new PostgresDriftUnitOfWork(appPool);
    const reader = new PostgresDriftReader(appPool);
    const generator = ids();
    const recordContext = context("DRIFT_RECORD", "drift-runtime-key-0001", "2026-08-18T20:00:00.000Z");
    const occurrence = await recordDrift({
      sourceNote: "Comparison pulled me away from the stable direction.",
    }, recordContext, {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:00:01.000Z" },
      ids: generator,
    });
    const replay = await recordDrift({
      sourceNote: "Comparison pulled me away from the stable direction.",
    }, recordContext, {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:00:02.000Z" },
      ids: generator,
    });
    assert.equal(replay.driftId, occurrence.driftId);
    assert.equal(replay.idempotentReplay, true);

    const understood = await confirmDriftUnderstanding(occurrence.driftId, {
      explanation: "COMPARISON",
      triggerNote: "A launch announcement",
      emotionNote: "Behind",
      distractionNote: "A different product",
      expectedCurrentDecisionId: null,
    }, context("DRIFT_UNDERSTAND", "drift-understand-runtime-0001", "2026-08-18T20:10:00.000Z"), {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:10:01.000Z" },
      ids: generator,
    });
    await recordDriftReturn(occurrence.driftId, {
      returnPosture: "RETURN_TO_DIRECTION",
      expectedCurrentRevision: understood.revision,
    }, context("DRIFT_RETURN", "drift-return-runtime-0001", "2026-08-18T20:20:00.000Z"), {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:20:01.000Z" },
      ids: generator,
    });

    const overview = await getDriftOverview("user-a", reader);
    assert.equal(overview.items[0]?.sourceNote, "Comparison pulled me away from the stable direction.");
    assert.equal(overview.items[0]?.lifecycleState, "RESOLVED");
    assert.equal(overview.items[0]?.decisionHistory.length, 2);
    assert.deepEqual(await getDriftOverview("user-b", reader), { items: [] });

    const adminScope = new PostgresUserScope(migrationPool);
    const stored = await adminScope.run("user-a", async (client) => {
      const result = await client.query<{
        occurrence_count: number;
        decision_revision_count: number;
        event_count: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM drift_occurrence) AS occurrence_count,
          (SELECT count(*)::int FROM drift_decision) AS decision_revision_count,
          (
            SELECT count(*)::int FROM domain_event
             WHERE event_type IN (
               'DRIFT_RECORDED',
               'DRIFT_UNDERSTANDING_CONFIRMED',
               'DRIFT_RETURN_RECORDED',
               'DRIFT_RESOLVED'
             )
          ) AS event_count
      `);
      return result.rows[0];
    });
    assert.deepEqual(stored, {
      occurrence_count: 1,
      decision_revision_count: 2,
      event_count: 3,
    });

    const eventPayloads = await adminScope.run("user-a", async (client) => client.query<{ payload: string }>(`
      SELECT payload_json::text AS payload FROM domain_event
       WHERE event_type LIKE 'DRIFT_%'
    `));
    assert.equal(JSON.stringify(eventPayloads.rows).includes("A launch announcement"), false);
    assert.equal(JSON.stringify(eventPayloads.rows).includes("A different product"), false);

    const revoked = await revokeDriftDatabaseRole(migrationPool, roleName);
    assert.equal(revoked.ready, false);
    assert.equal(revoked.leastPrivilegeTableCount, 0);
    assert.equal(await readiness.check(), false);
  } finally {
    await appPool.end();
  }
});
