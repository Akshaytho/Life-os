import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  defaultMigrationDirectory,
  loadMigrationFiles,
  MigrationRunnerError,
  migrationRuntimeConfigurationFromEnv,
  stripOuterMigrationTransaction,
} from "./migration-runner";

test("current Life OS migration set is contiguous, checksummed and runner-transaction compatible", async () => {
  const migrations = await loadMigrationFiles(defaultMigrationDirectory);

  assert.deepEqual(
    migrations.map((migration) => migration.filename),
    [
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
    ],
  );
  assert.deepEqual(migrations.map((migration) => migration.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const migration of migrations) {
    assert.match(migration.checksumSha256, /^[0-9a-f]{64}$/);
    assert.equal(/^\s*BEGIN\s*;/i.test(migration.body), false);
    assert.equal(/COMMIT\s*;\s*$/i.test(migration.body), false);
    assert.ok(migration.body.length > 0);
  }
});

test("migration parser requires one outer transaction and rejects nested transaction control", () => {
  assert.equal(
    stripOuterMigrationTransaction("BEGIN;\nCREATE TABLE example(id integer);\nCOMMIT;\n", "0001_example.sql"),
    "CREATE TABLE example(id integer);",
  );

  for (const sql of [
    "CREATE TABLE example(id integer);",
    "BEGIN; COMMIT;",
    "BEGIN; BEGIN; SELECT 1; COMMIT; COMMIT;",
    "BEGIN; ROLLBACK; COMMIT;",
  ]) {
    assert.throws(
      () => stripOuterMigrationTransaction(sql, "0001_example.sql"),
      (error: unknown) => error instanceof MigrationRunnerError && error.code === "INVALID_MIGRATION_SET",
    );
  }
});

test("migration discovery refuses gaps instead of silently skipping schema history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "life-os-migrations-gap-"));
  try {
    await writeFile(join(directory, "0001_first.sql"), "BEGIN; SELECT 1; COMMIT;\n");
    await writeFile(join(directory, "0003_third.sql"), "BEGIN; SELECT 3; COMMIT;\n");

    await assert.rejects(
      () => loadMigrationFiles(directory),
      (error: unknown) =>
        error instanceof MigrationRunnerError &&
        error.code === "INVALID_MIGRATION_SET" &&
        /expected 0002/.test(error.message),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("hosted development requires migration credential separation and production is refused", () => {
  const migrationUrl = "postgresql://migration-user:secret@example.invalid/lifeos";
  const applicationUrl = "postgresql://application-user:other@example.invalid/lifeos";

  assert.deepEqual(
    migrationRuntimeConfigurationFromEnv({
      LIFE_OS_ENVIRONMENT: "development",
      LIFE_OS_RELEASE_SHA: "release-1",
      MIGRATION_DATABASE_URL: migrationUrl,
      DATABASE_URL: applicationUrl,
    }),
    { migrationDatabaseUrl: migrationUrl, environment: "development" },
  );

  assert.throws(
    () => migrationRuntimeConfigurationFromEnv({
      LIFE_OS_ENVIRONMENT: "development",
      LIFE_OS_RELEASE_SHA: "release-1",
      MIGRATION_DATABASE_URL: migrationUrl,
      DATABASE_URL: migrationUrl,
    }),
    (error: unknown) =>
      error instanceof MigrationRunnerError &&
      error.code === "CONFIGURATION_INVALID" &&
      /separate migration and application/.test(error.message) &&
      !error.message.includes("secret"),
  );

  assert.throws(
    () => migrationRuntimeConfigurationFromEnv({
      LIFE_OS_ENVIRONMENT: "production",
      LIFE_OS_RELEASE_SHA: "prod-release",
      MIGRATION_DATABASE_URL: migrationUrl,
    }),
    (error: unknown) =>
      error instanceof MigrationRunnerError &&
      error.code === "CONFIGURATION_INVALID" &&
      /refuses production/.test(error.message) &&
      !error.message.includes("secret"),
  );
});

test("missing migration credential fails closed without echoing other environment values", () => {
  assert.throws(
    () => migrationRuntimeConfigurationFromEnv({
      LIFE_OS_ENVIRONMENT: "local",
      DATABASE_URL: "postgresql://application-user:private-password@example.invalid/lifeos",
    }),
    (error: unknown) =>
      error instanceof MigrationRunnerError &&
      error.code === "CONFIGURATION_INVALID" &&
      error.message === "MIGRATION_DATABASE_URL is required" &&
      !error.message.includes("private-password"),
  );
});
