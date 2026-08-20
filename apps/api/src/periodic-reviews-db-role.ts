import type { Pool, PoolClient } from "pg";
import {
  applicationDbRolePlanConfigurationFromEnv,
  planApplicationDatabaseRole,
  type ApplicationDbRolePlanConfiguration,
} from "./application-db-role";
import { planDatabaseMigrations } from "./migration-runner";
import { periodicReviewTable } from "./private-database-contract";

const lockName = "life-os-periodic-reviews-role-v1";

export class PeriodicReviewsDbRoleError extends Error {
  constructor(message: string, readonly code: "CONFIGURATION_INVALID" | "MIGRATIONS_PENDING" | "BASE_ROLE_NOT_READY" | "TABLE_NOT_READY" | "APPLY_FAILED") {
    super(message); this.name = "PeriodicReviewsDbRoleError";
  }
}

export type PeriodicReviewsDbRoleConfiguration = ApplicationDbRolePlanConfiguration;
export const periodicReviewsDbRoleConfigurationFromEnv = applicationDbRolePlanConfigurationFromEnv;

export interface PeriodicReviewsDbRolePlan {
  roleName: string;
  schemaName: string;
  migrationsPending: string[];
  baselineRoleReady: boolean;
  tableExists: boolean;
  forcedRls: boolean;
  nonOwner: boolean;
  leastPrivilege: boolean;
  ready: boolean;
}

async function withClient<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { return await work(client) } finally { client.release() }
}

async function inspect(client: PoolClient, roleName: string, migrationsPending: string[], baselineRoleReady: boolean): Promise<PeriodicReviewsDbRolePlan> {
  const schema = await client.query<{ schema_name: string }>("SELECT current_schema() AS schema_name");
  const result = await client.query<{
    table_exists: boolean; forced_rls: boolean; non_owner: boolean;
    can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean;
    can_truncate: boolean; can_references: boolean; can_trigger: boolean;
  }>(`
    SELECT c.oid IS NOT NULL AS table_exists,
           COALESCE(c.relrowsecurity AND c.relforcerowsecurity, false) AS forced_rls,
           COALESCE(pg_get_userbyid(c.relowner) <> $1, false) AS non_owner,
           COALESCE(has_table_privilege($1, c.oid, 'SELECT'), false) AS can_select,
           COALESCE(has_table_privilege($1, c.oid, 'INSERT'), false) AS can_insert,
           COALESCE(has_table_privilege($1, c.oid, 'UPDATE'), false) AS can_update,
           COALESCE(has_table_privilege($1, c.oid, 'DELETE'), false) AS can_delete,
           COALESCE(has_table_privilege($1, c.oid, 'TRUNCATE'), false) AS can_truncate,
           COALESCE(has_table_privilege($1, c.oid, 'REFERENCES'), false) AS can_references,
           COALESCE(has_table_privilege($1, c.oid, 'TRIGGER'), false) AS can_trigger
      FROM (SELECT 1) required
      LEFT JOIN pg_namespace n ON n.nspname = current_schema()
      LEFT JOIN pg_class c ON c.relnamespace = n.oid
        AND c.relname = '${periodicReviewTable}' AND c.relkind IN ('r', 'p')
  `, [roleName]);
  const row = result.rows[0]!;
  const leastPrivilege = row.can_select && row.can_insert && row.can_update
    && !row.can_delete && !row.can_truncate && !row.can_references && !row.can_trigger;
  return {
    roleName, schemaName: schema.rows[0]?.schema_name ?? "", migrationsPending,
    baselineRoleReady, tableExists: row.table_exists, forcedRls: row.forced_rls,
    nonOwner: row.non_owner, leastPrivilege,
    ready: migrationsPending.length === 0 && baselineRoleReady && row.table_exists
      && row.forced_rls && row.non_owner && leastPrivilege,
  };
}

export async function planPeriodicReviewsDatabaseRole(pool: Pool, roleName: string) {
  const migrations = await planDatabaseMigrations(pool);
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  return withClient(pool, (client) => inspect(client, baseline.roleName, migrations.pending, baseline.ready));
}

async function quoted(client: PoolClient, roleName: string) {
  const result = await client.query<{ role_ident: string; schema_ident: string }>(
    "SELECT quote_ident($1) AS role_ident, quote_ident(current_schema()) AS schema_ident", [roleName],
  );
  if (!result.rows[0]) throw new PeriodicReviewsDbRoleError("Unable to quote capability", "APPLY_FAILED");
  return result.rows[0];
}

export async function applyPeriodicReviewsDatabaseRole(pool: Pool, roleName: string) {
  const migrations = await planDatabaseMigrations(pool);
  if (migrations.pending.length) throw new PeriodicReviewsDbRoleError("Migrations pending", "MIGRATIONS_PENDING");
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  if (!baseline.ready) throw new PeriodicReviewsDbRoleError("Baseline role is not ready", "BASE_ROLE_NOT_READY");
  return withClient(pool, async (client) => {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockName]);
    try {
      const before = await inspect(client, baseline.roleName, [], true);
      if (!before.tableExists || !before.forcedRls || !before.nonOwner) {
        throw new PeriodicReviewsDbRoleError("Periodic review table is not protected", "TABLE_NOT_READY");
      }
      const value = await quoted(client, baseline.roleName);
      await client.query("BEGIN");
      try {
        await client.query(`REVOKE ALL PRIVILEGES ON TABLE ${value.schema_ident}."${periodicReviewTable}" FROM ${value.role_ident}`);
        await client.query(`GRANT SELECT, INSERT, UPDATE ON TABLE ${value.schema_ident}."${periodicReviewTable}" TO ${value.role_ident}`);
        const after = await inspect(client, baseline.roleName, [], true);
        if (!after.ready) throw new PeriodicReviewsDbRoleError("Least privilege check failed", "TABLE_NOT_READY");
        await client.query("COMMIT");
        return after;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockName]).catch(() => undefined);
    }
  });
}

export async function revokePeriodicReviewsDatabaseRole(pool: Pool, roleName: string) {
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  if (!baseline.roleExists) throw new PeriodicReviewsDbRoleError("Baseline role missing", "BASE_ROLE_NOT_READY");
  return withClient(pool, async (client) => {
    const value = await quoted(client, baseline.roleName);
    const relation = await client.query<{ exists: boolean }>(
      `SELECT to_regclass(format('%I.%I', current_schema(), '${periodicReviewTable}')) IS NOT NULL AS exists`,
    );
    if (relation.rows[0]?.exists) {
      await client.query(`REVOKE ALL PRIVILEGES ON TABLE ${value.schema_ident}."${periodicReviewTable}" FROM ${value.role_ident}`);
    }
    const migrations = await planDatabaseMigrations(pool);
    return inspect(client, baseline.roleName, migrations.pending, baseline.ready);
  });
}
