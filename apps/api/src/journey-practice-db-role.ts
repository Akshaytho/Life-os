import type { Pool, PoolClient } from "pg";
import {
  applicationDbRolePlanConfigurationFromEnv,
  planApplicationDatabaseRole,
  type ApplicationDbRolePlanConfiguration,
} from "./application-db-role";
import { planDatabaseMigrations } from "./migration-runner";
import {
  journeyCapabilityDecisionTable,
  journeyPracticeCompletionTable,
  journeyPracticeSessionTable,
} from "./private-database-contract";

const capabilityLockName = "life-os-journey-practice-role-v1";
const capabilityTables = [
  journeyCapabilityDecisionTable,
  journeyPracticeSessionTable,
  journeyPracticeCompletionTable,
] as const;

export class JourneyPracticeDbRoleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CONFIGURATION_INVALID"
      | "MIGRATIONS_PENDING"
      | "BASE_ROLE_NOT_READY"
      | "JOURNEY_TABLES_NOT_READY"
      | "JOURNEY_ROLE_APPLY_FAILED",
  ) {
    super(message);
    this.name = "JourneyPracticeDbRoleError";
  }
}

export type JourneyPracticeDbRoleConfiguration = ApplicationDbRolePlanConfiguration;

export interface JourneyPracticeDbRolePlan {
  roleName: string;
  schemaName: string;
  migrationsPending: string[];
  baselineRoleReady: boolean;
  tableCount: number;
  protectedTableCount: number;
  nonOwnerTableCount: number;
  leastPrivilegeTableCount: number;
  ready: boolean;
}

export function journeyPracticeDbRoleConfigurationFromEnv(
  env: NodeJS.ProcessEnv,
): JourneyPracticeDbRoleConfiguration {
  return applicationDbRolePlanConfigurationFromEnv(env);
}

async function withClient<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

async function inspectCapability(
  client: PoolClient,
  roleName: string,
  migrationsPending: string[],
  baselineRoleReady: boolean,
): Promise<JourneyPracticeDbRolePlan> {
  const schema = await client.query<{ schema_name: string }>("SELECT current_schema() AS schema_name");
  const result = await client.query<{
    table_name: string;
    table_exists: boolean;
    forced_rls: boolean;
    non_owner: boolean;
    can_select: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
    can_truncate: boolean;
    can_references: boolean;
    can_trigger: boolean;
  }>(`
    WITH required_table(table_name) AS (
      VALUES
        ('${journeyCapabilityDecisionTable}'),
        ('${journeyPracticeSessionTable}'),
        ('${journeyPracticeCompletionTable}')
    )
    SELECT required.table_name,
           c.oid IS NOT NULL AS table_exists,
           COALESCE(c.relrowsecurity AND c.relforcerowsecurity, false) AS forced_rls,
           COALESCE(pg_get_userbyid(c.relowner) <> $1, false) AS non_owner,
           COALESCE(has_table_privilege($1, c.oid, 'SELECT'), false) AS can_select,
           COALESCE(has_table_privilege($1, c.oid, 'INSERT'), false) AS can_insert,
           COALESCE(has_table_privilege($1, c.oid, 'UPDATE'), false) AS can_update,
           COALESCE(has_table_privilege($1, c.oid, 'DELETE'), false) AS can_delete,
           COALESCE(has_table_privilege($1, c.oid, 'TRUNCATE'), false) AS can_truncate,
           COALESCE(has_table_privilege($1, c.oid, 'REFERENCES'), false) AS can_references,
           COALESCE(has_table_privilege($1, c.oid, 'TRIGGER'), false) AS can_trigger
      FROM required_table required
      LEFT JOIN pg_namespace n ON n.nspname = current_schema()
      LEFT JOIN pg_class c
        ON c.relnamespace = n.oid
       AND c.relname = required.table_name
       AND c.relkind IN ('r', 'p')
     ORDER BY required.table_name
  `, [roleName]);
  const tableCount = result.rows.filter((row) => row.table_exists).length;
  const protectedTableCount = result.rows.filter((row) => row.forced_rls).length;
  const nonOwnerTableCount = result.rows.filter((row) => row.non_owner).length;
  const leastPrivilegeTableCount = result.rows.filter((row) => (
    row.can_select && row.can_insert && !row.can_update && !row.can_delete
    && !row.can_truncate && !row.can_references && !row.can_trigger
  )).length;
  return {
    roleName,
    schemaName: schema.rows[0]?.schema_name ?? "",
    migrationsPending,
    baselineRoleReady,
    tableCount,
    protectedTableCount,
    nonOwnerTableCount,
    leastPrivilegeTableCount,
    ready: migrationsPending.length === 0
      && baselineRoleReady
      && tableCount === capabilityTables.length
      && protectedTableCount === capabilityTables.length
      && nonOwnerTableCount === capabilityTables.length
      && leastPrivilegeTableCount === capabilityTables.length,
  };
}

export async function planJourneyPracticeDatabaseRole(
  pool: Pool,
  roleName: string,
): Promise<JourneyPracticeDbRolePlan> {
  const migrationPlan = await planDatabaseMigrations(pool);
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  return withClient(pool, (client) => inspectCapability(
    client, baseline.roleName, migrationPlan.pending, baseline.ready,
  ));
}

async function quoteRoleAndSchema(client: PoolClient, roleName: string) {
  const result = await client.query<{ role_ident: string; schema_ident: string }>(`
    SELECT quote_ident($1) AS role_ident, quote_ident(current_schema()) AS schema_ident
  `, [roleName]);
  const row = result.rows[0];
  if (!row) {
    throw new JourneyPracticeDbRoleError(
      "Unable to quote Journey role material",
      "JOURNEY_ROLE_APPLY_FAILED",
    );
  }
  return row;
}

async function requireActivationPreconditions(pool: Pool, roleName: string) {
  const migrationPlan = await planDatabaseMigrations(pool);
  if (migrationPlan.pending.length > 0) {
    throw new JourneyPracticeDbRoleError(
      "All Life OS migrations, including Journey migration 0011, must be applied first",
      "MIGRATIONS_PENDING",
    );
  }
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  if (!baseline.ready) {
    throw new JourneyPracticeDbRoleError(
      "The baseline Life OS application role must satisfy its contract first",
      "BASE_ROLE_NOT_READY",
    );
  }
  return baseline.roleName;
}

export async function applyJourneyPracticeDatabaseRole(
  pool: Pool,
  roleName: string,
): Promise<JourneyPracticeDbRolePlan> {
  const validatedRoleName = await requireActivationPreconditions(pool, roleName);
  return withClient(pool, async (client) => {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [capabilityLockName]);
    try {
      const before = await inspectCapability(client, validatedRoleName, [], true);
      if (
        before.tableCount !== capabilityTables.length
        || before.protectedTableCount !== capabilityTables.length
        || before.nonOwnerTableCount !== capabilityTables.length
      ) {
        throw new JourneyPracticeDbRoleError(
          "Journey tables must exist with FORCE RLS and non-ownership before grants",
          "JOURNEY_TABLES_NOT_READY",
        );
      }
      const quoted = await quoteRoleAndSchema(client, validatedRoleName);
      await client.query("BEGIN");
      try {
        for (const table of capabilityTables) {
          await client.query(
            `REVOKE ALL PRIVILEGES ON TABLE ${quoted.schema_ident}."${table}" FROM ${quoted.role_ident}`,
          );
          await client.query(
            `GRANT SELECT, INSERT ON TABLE ${quoted.schema_ident}."${table}" TO ${quoted.role_ident}`,
          );
        }
        const after = await inspectCapability(client, validatedRoleName, [], true);
        if (!after.ready) {
          throw new JourneyPracticeDbRoleError(
            "Journey capability did not satisfy append-only least privilege",
            "JOURNEY_TABLES_NOT_READY",
          );
        }
        await client.query("COMMIT");
        return after;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (error instanceof JourneyPracticeDbRoleError) throw error;
        throw new JourneyPracticeDbRoleError(
          "Journey capability provisioning failed",
          "JOURNEY_ROLE_APPLY_FAILED",
        );
      }
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext($1))",
        [capabilityLockName],
      ).catch(() => undefined);
    }
  });
}

export async function revokeJourneyPracticeDatabaseRole(
  pool: Pool,
  roleName: string,
): Promise<JourneyPracticeDbRolePlan> {
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  if (!baseline.roleExists) {
    throw new JourneyPracticeDbRoleError(
      "Baseline application role does not exist",
      "BASE_ROLE_NOT_READY",
    );
  }
  return withClient(pool, async (client) => {
    const quoted = await quoteRoleAndSchema(client, baseline.roleName);
    for (const table of capabilityTables) {
      const relation = await client.query<{ exists: boolean }>(`
        SELECT to_regclass(format('%I.%I', current_schema(), '${table}')) IS NOT NULL AS exists
      `);
      if (relation.rows[0]?.exists === true) {
        await client.query(
          `REVOKE ALL PRIVILEGES ON TABLE ${quoted.schema_ident}."${table}" FROM ${quoted.role_ident}`,
        );
      }
    }
    const migrationPlan = await planDatabaseMigrations(pool);
    return inspectCapability(client, baseline.roleName, migrationPlan.pending, baseline.ready);
  });
}
