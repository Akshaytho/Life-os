import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, beforeEach } from "node:test";
import { Pool } from "pg";
import {
  applyDatabaseMigrations,
  MigrationRunnerError,
  planDatabaseMigrations,
} from "./migration-runner";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "migration_runner_test";
const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const migrationPool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  options: `-c search_path=${schema}`,
});

beforeEach(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);
});

after(async () => {
  await migrationPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.end();
});

test("plan is read-only, apply is ordered/idempotent, and migration history is checksummed", async () => {
  const initialPlan = await planDatabaseMigrations(migrationPool);
  assert.deepEqual(initialPlan.alreadyApplied, []);
  assert.deepEqual(initialPlan.pending, [
    "0001_write_boundary.sql",
    "0002_capture_routing_proposal.sql",
    "0003_proposal_creation_provenance.sql",
    "0004_row_level_authorization.sql",
    "0005_proposal_rejection_provenance.sql",
    "0006_safe_fallback_interpreter.sql",
    "0007_direction_decision.sql",
    "0008_daily_return_review.sql",
    "0009_brain_dump_not_now.sql",
    "0010_drift_return.sql",
    "0011_journey_activation_practice.sql",
  ]);

  const beforeApply = await adminPool.query<{ ledger: string | null }>(
    `SELECT to_regclass('${schema}.lifeos_schema_migration')::text AS ledger`,
  );
  assert.equal(beforeApply.rows[0].ledger, null, "plan mode must not create migration metadata");

  const first = await applyDatabaseMigrations(migrationPool);
  assert.deepEqual(first.alreadyApplied, []);
  assert.deepEqual(first.appliedNow, initialPlan.pending);
  assert.deepEqual(first.pending, []);

  const history = await migrationPool.query<{
    sequence: number;
    filename: string;
    checksum_sha256: string;
  }>(`
    SELECT sequence, filename, checksum_sha256
    FROM lifeos_schema_migration
    ORDER BY sequence
  `);
  assert.equal(history.rowCount, 11);
  assert.deepEqual(history.rows.map((row) => row.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(history.rows.map((row) => row.filename), initialPlan.pending);
  for (const row of history.rows) assert.match(row.checksum_sha256, /^[0-9a-f]{64}$/);

  for (const table of [
    "calendar_event",
    "domain_event",
    "applied_proposal",
    "capture_record",
    "routing_interpretation",
    "routing_proposal",
    "proposal_rejection",
    "direction_decision",
    "daily_log_entry",
    "daily_return_review",
    "brain_dump_classification",
    "not_now_item",
    "drift_occurrence",
    "drift_decision",
    "journey_capability_decision",
    "journey_practice_session",
    "journey_practice_completion",
  ]) {
    const result = await adminPool.query<{ relation: string | null }>(
      `SELECT to_regclass('${schema}.${table}')::text AS relation`,
    );
    assert.ok(result.rows[0].relation, `${table} should exist after ordered migration apply`);
  }

  const second = await applyDatabaseMigrations(migrationPool);
  assert.deepEqual(second.alreadyApplied, initialPlan.pending);
  assert.deepEqual(second.appliedNow, []);
  assert.deepEqual(second.pending, []);

  const finalPlan = await planDatabaseMigrations(migrationPool);
  assert.deepEqual(finalPlan.alreadyApplied, initialPlan.pending);
  assert.deepEqual(finalPlan.pending, []);
});

test("existing Life OS tables without migration history are rejected instead of retroactively certified", async () => {
  await migrationPool.query("CREATE TABLE capture_record (capture_id text PRIMARY KEY)");

  for (const action of [
    () => planDatabaseMigrations(migrationPool),
    () => applyDatabaseMigrations(migrationPool),
  ]) {
    await assert.rejects(
      action,
      (error: unknown) =>
        error instanceof MigrationRunnerError &&
        error.code === "MIGRATION_HISTORY_DRIFT" &&
        error.message === "Life OS schema objects exist without tracked migration history",
    );
  }

  const ledger = await adminPool.query<{ relation: string | null }>(
    `SELECT to_regclass('${schema}.lifeos_schema_migration')::text AS relation`,
  );
  assert.equal(ledger.rows[0].relation, null, "rejected untracked schema must not receive a trusted migration ledger");
});

test("checksum/history drift is rejected instead of silently accepting edited applied SQL", async () => {
  await applyDatabaseMigrations(migrationPool);
  await migrationPool.query(
    "UPDATE lifeos_schema_migration SET checksum_sha256 = $1 WHERE sequence = 3",
    ["0".repeat(64)],
  );

  await assert.rejects(
    () => planDatabaseMigrations(migrationPool),
    (error: unknown) =>
      error instanceof MigrationRunnerError &&
      error.code === "MIGRATION_HISTORY_DRIFT" &&
      /sequence 0003/.test(error.message),
  );
});

test("a failing migration rolls back schema changes and its history record atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "life-os-failing-migration-"));
  try {
    await writeFile(
      join(directory, "0001_atomic_failure.sql"),
      [
        "BEGIN;",
        "CREATE TABLE migration_atomic_probe (id integer PRIMARY KEY);",
        "SELECT 1 / 0;",
        "COMMIT;",
        "",
      ].join("\n"),
    );

    await assert.rejects(
      () => applyDatabaseMigrations(migrationPool, directory),
      (error: unknown) =>
        error instanceof MigrationRunnerError &&
        error.code === "MIGRATION_FAILED" &&
        error.message === "Migration 0001_atomic_failure.sql failed",
    );

    const probe = await adminPool.query<{ relation: string | null }>(
      `SELECT to_regclass('${schema}.migration_atomic_probe')::text AS relation`,
    );
    assert.equal(probe.rows[0].relation, null, "failed migration table must be rolled back");

    const history = await migrationPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM lifeos_schema_migration",
    );
    assert.equal(history.rows[0].count, 0, "failed migration must not leave an applied history row");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
