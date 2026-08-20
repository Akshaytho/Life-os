import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";
import type { LifeOsEnvironment } from "../../../packages/contracts/runtime-provenance";
import { productionReleaseApprovedForRuntime } from "./production-release-approval";
import { resolveRuntimeProvenance } from "./runtime-provenance";

const migrationNamePattern = /^(\d{4})_[a-z0-9_]+\.sql$/;
const migrationLockName = "life-os-schema-migrations-v1";
const migrationLedgerRestrictedRoleNames = ["anon", "authenticated", "service_role"];
const knownLifeOsTables = [
  "calendar_event",
  "domain_event",
  "applied_proposal",
  "capture_record",
  "routing_interpretation",
  "routing_proposal",
  "proposal_rejection",
  "daily_log_entry",
  "daily_return_review",
  "brain_dump_classification",
  "not_now_item",
  "drift_occurrence",
  "drift_decision",
  "journey_capability_decision",
  "journey_practice_session",
  "journey_practice_completion",
  "periodic_review",
  "memory_item",
] as const;

export const defaultMigrationDirectory = fileURLToPath(
  new URL("../../../packages/database/migrations/", import.meta.url),
);

export class MigrationRunnerError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CONFIGURATION_INVALID"
      | "INVALID_MIGRATION_SET"
      | "MIGRATION_HISTORY_DRIFT"
      | "MIGRATION_FAILED",
  ) {
    super(message);
    this.name = "MigrationRunnerError";
  }
}

export interface MigrationRuntimeConfiguration {
  migrationDatabaseUrl: string;
  environment: LifeOsEnvironment;
}

export interface MigrationFile {
  sequence: number;
  filename: string;
  checksumSha256: string;
  body: string;
}

export interface MigrationPlan {
  alreadyApplied: string[];
  pending: string[];
}

export interface MigrationApplyReceipt extends MigrationPlan {
  appliedNow: string[];
}

interface MigrationHistoryRow {
  sequence: number;
  filename: string;
  checksum_sha256: string;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function requiredText(value: string | undefined, label: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw new MigrationRunnerError(`${label} is required`, "CONFIGURATION_INVALID");
  return normalized;
}

export function migrationRuntimeConfigurationFromEnv(env: NodeJS.ProcessEnv): MigrationRuntimeConfiguration {
  const runtime = resolveRuntimeProvenance(env);
  if (!productionReleaseApprovedForRuntime(env, runtime)) {
    throw new MigrationRunnerError(
      "Production migration requires LIFE_OS_PRODUCTION_RELEASE_SHA to match the reviewed release",
      "CONFIGURATION_INVALID",
    );
  }

  const migrationDatabaseUrl = requiredText(env.MIGRATION_DATABASE_URL, "MIGRATION_DATABASE_URL");
  const applicationDatabaseUrl = optionalText(env.DATABASE_URL);
  if (
    (runtime.environment === "development" || runtime.environment === "production") &&
    applicationDatabaseUrl &&
    applicationDatabaseUrl === migrationDatabaseUrl
  ) {
    throw new MigrationRunnerError(
      "Hosted environments require separate migration and application database credentials",
      "CONFIGURATION_INVALID",
    );
  }

  return {
    migrationDatabaseUrl,
    environment: runtime.environment,
  };
}

export function stripOuterMigrationTransaction(sql: string, filename: string): string {
  const match = /^\s*BEGIN\s*;([\s\S]*?)COMMIT\s*;\s*$/i.exec(sql);
  if (!match) {
    throw new MigrationRunnerError(
      `${filename} must contain exactly one outer BEGIN/COMMIT wrapper`,
      "INVALID_MIGRATION_SET",
    );
  }

  const body = match[1].trim();
  if (!body) {
    throw new MigrationRunnerError(`${filename} cannot be empty`, "INVALID_MIGRATION_SET");
  }
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body)) {
    throw new MigrationRunnerError(
      `${filename} must not contain nested transaction-control statements`,
      "INVALID_MIGRATION_SET",
    );
  }
  return body;
}

export async function loadMigrationFiles(directory = defaultMigrationDirectory): Promise<MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => migrationNamePattern.test(name))
    .sort((left, right) => left.localeCompare(right));

  if (names.length === 0) {
    throw new MigrationRunnerError("No Life OS database migrations were found", "INVALID_MIGRATION_SET");
  }

  const migrations: MigrationFile[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const filename = names[index];
    const match = migrationNamePattern.exec(filename)!;
    const sequence = Number(match[1]);
    const expectedSequence = index + 1;
    if (sequence !== expectedSequence) {
      throw new MigrationRunnerError(
        `Migration sequence must be contiguous from 0001; expected ${String(expectedSequence).padStart(4, "0")}`,
        "INVALID_MIGRATION_SET",
      );
    }

    const sql = await readFile(join(directory, filename), "utf8");
    migrations.push({
      sequence,
      filename,
      checksumSha256: createHash("sha256").update(sql).digest("hex"),
      body: stripOuterMigrationTransaction(sql, filename),
    });
  }

  return migrations;
}

async function readMigrationHistory(client: PoolClient): Promise<MigrationHistoryRow[]> {
  const ledger = await client.query<{ ledger: string | null }>(
    "SELECT to_regclass('lifeos_schema_migration')::text AS ledger",
  );
  if (!ledger.rows[0]?.ledger) return [];

  const result = await client.query<MigrationHistoryRow>(`
    SELECT sequence, filename, checksum_sha256
    FROM lifeos_schema_migration
    ORDER BY sequence
  `);
  return result.rows;
}

async function assertTrackedBootstrapState(client: PoolClient, history: MigrationHistoryRow[]): Promise<void> {
  if (history.length > 0) return;

  const result = await client.query<{ count: number }>(`
    SELECT count(*)::int AS count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relkind IN ('r', 'p')
      AND c.relname = ANY($1::text[])
  `, [knownLifeOsTables]);

  if ((result.rows[0]?.count ?? 0) > 0) {
    throw new MigrationRunnerError(
      "Life OS schema objects exist without tracked migration history",
      "MIGRATION_HISTORY_DRIFT",
    );
  }
}

function validateHistory(migrations: MigrationFile[], history: MigrationHistoryRow[]): MigrationPlan {
  if (history.length > migrations.length) {
    throw new MigrationRunnerError(
      "Database migration history contains migrations missing from this release",
      "MIGRATION_HISTORY_DRIFT",
    );
  }

  const alreadyApplied: string[] = [];
  for (let index = 0; index < history.length; index += 1) {
    const recorded = history[index];
    const expected = migrations[index];
    if (
      !expected ||
      recorded.sequence !== expected.sequence ||
      recorded.filename !== expected.filename ||
      recorded.checksum_sha256 !== expected.checksumSha256
    ) {
      throw new MigrationRunnerError(
        `Migration history drift detected at sequence ${String(index + 1).padStart(4, "0")}`,
        "MIGRATION_HISTORY_DRIFT",
      );
    }
    alreadyApplied.push(expected.filename);
  }

  return {
    alreadyApplied,
    pending: migrations.slice(history.length).map((migration) => migration.filename),
  };
}

async function hardenMigrationLedger(client: PoolClient): Promise<void> {
  // The ledger is technical deployment state, not user data. Ordinary RLS gives defense in
  // depth without FORCE RLS, so its migration owner/admin can still maintain history while a
  // non-owner with an accidental future grant sees no rows because the ledger has no policies.
  await client.query("ALTER TABLE lifeos_schema_migration ENABLE ROW LEVEL SECURITY");
  await client.query("REVOKE ALL PRIVILEGES ON TABLE lifeos_schema_migration FROM PUBLIC");

  // Supabase can auto-grant new public-schema tables to these API roles. Other PostgreSQL
  // environments may not define them, so discover only the exact reviewed role names that
  // exist and let PostgreSQL quote the identifiers before revoking every table privilege.
  const roles = await client.query<{ role_ident: string }>(`
    SELECT quote_ident(rolname) AS role_ident
    FROM pg_roles
    WHERE rolname = ANY($1::text[])
  `, [migrationLedgerRestrictedRoleNames]);

  for (const role of roles.rows) {
    await client.query(
      `REVOKE ALL PRIVILEGES ON TABLE lifeos_schema_migration FROM ${role.role_ident}`,
    );
  }
}

async function ensureMigrationLedger(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS lifeos_schema_migration (
      sequence integer PRIMARY KEY CHECK (sequence > 0),
      filename text NOT NULL UNIQUE CHECK (length(btrim(filename)) > 0),
      checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await hardenMigrationLedger(client);
}

async function withMigrationClient<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

export async function planDatabaseMigrations(
  pool: Pool,
  directory = defaultMigrationDirectory,
): Promise<MigrationPlan> {
  const migrations = await loadMigrationFiles(directory);
  return withMigrationClient(pool, async (client) => {
    const history = await readMigrationHistory(client);
    await assertTrackedBootstrapState(client, history);
    return validateHistory(migrations, history);
  });
}

export async function applyDatabaseMigrations(
  pool: Pool,
  directory = defaultMigrationDirectory,
): Promise<MigrationApplyReceipt> {
  const migrations = await loadMigrationFiles(directory);

  return withMigrationClient(pool, async (client) => {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [migrationLockName]);
    try {
      const initialHistory = await readMigrationHistory(client);
      await assertTrackedBootstrapState(client, initialHistory);
      const initialPlan = validateHistory(migrations, initialHistory);
      await ensureMigrationLedger(client);
      const appliedNow: string[] = [];

      for (const migration of migrations.slice(initialHistory.length)) {
        try {
          await client.query("BEGIN");
          await client.query(migration.body);
          await client.query(
            `INSERT INTO lifeos_schema_migration (sequence, filename, checksum_sha256)
             VALUES ($1, $2, $3)`,
            [migration.sequence, migration.filename, migration.checksumSha256],
          );
          await client.query("COMMIT");
          appliedNow.push(migration.filename);
        } catch {
          await client.query("ROLLBACK").catch(() => undefined);
          throw new MigrationRunnerError(
            `Migration ${migration.filename} failed`,
            "MIGRATION_FAILED",
          );
        }
      }

      const finalHistory = await readMigrationHistory(client);
      const finalPlan = validateHistory(migrations, finalHistory);
      return {
        alreadyApplied: initialPlan.alreadyApplied,
        pending: finalPlan.pending,
        appliedNow,
      };
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [migrationLockName]).catch(() => undefined);
    }
  });
}
