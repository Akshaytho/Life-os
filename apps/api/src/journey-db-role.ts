import type { Pool, PoolClient } from "pg";
import {
  applicationDbRolePlanConfigurationFromEnv,
  planApplicationDatabaseRole,
  type ApplicationDbRolePlanConfiguration,
} from "./application-db-role";
import { planDatabaseMigrations } from "./migration-runner";
import {
  forbiddenJourneyApplicationTablePrivileges,
  journeyDecisionTable,
  requiredJourneyApplicationTablePrivileges,
} from "./private-database-contract";

const journeyRoleLockName = "life-os-journey-role-v1";

export class JourneyDbRoleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CONFIGURATION_INVALID"
      | "MIGRATIONS_PENDING"
      | "BASE_ROLE_NOT_READY"
      | "JOURNEY_TABLE_NOT_READY"
      | "JOURNEY_ROLE_APPLY_FAILED",
  ) {
    super(message);
    this.name = "JourneyDbRoleError";
  }
}

export type JourneyDbRoleConfiguration = ApplicationDbRolePlanConfiguration;

export interface JourneyDbRolePlan {
  roleName: string;
  schemaName: string;
  migrationsPending: string[];
  baselineRoleReady: boolean;
  tableExists: boolean;
  protectedByForcedRls: boolean;
  nonOwner: boolean;
  requiredPrivileges: boolean;
  forbiddenPrivilegesAbsent: boolean;
  ready: boolean;
}

export function journeyDbRoleConfigurationFromEnv(env: NodeJS.ProcessEnv): JourneyDbRoleConfiguration {
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

async function inspectJourneyRole(
  client: PoolClient,
  roleName: string,
  migrationsPending: string[],
  baselineRoleReady: boolean,
): Promise<JourneyDbRolePlan> {
  const schemaResult = await client.query<{ schema_name: string }>("SELECT current_schema() AS schema_name");
  const schemaName = schemaResult.rows[0]?.schema_name ?? "";

  const requiredSql = requiredJourneyApplicationTablePrivileges
    .map((privilege) => `COALESCE(has_table_privilege($1, c.oid, '${privilege}'), false)`)
    .join("\n      AND ");
  const forbiddenSql = forbiddenJourneyApplicationTablePrivileges
    .map((privilege) => `NOT COALESCE(has_table_privilege($1, c.oid, '${privilege}'), false)`)
    .join("\n      AND ");

  const result = await client.query<{
    table_exists: boolean;
    forced_rls: boolean;
    non_owner: boolean;
    required_privileges: boolean;
    forbidden_privileges_absent: boolean;
  }>(`
    SELECT
      c.oid IS NOT NULL AS table_exists,
      COALESCE(c.relrowsecurity AND c.relforcerowsecurity, false) AS forced_rls,
      COALESCE(pg_get_userbyid(c.relowner) <> $1, false) AS non_owner,
      COALESCE(${requiredSql}, false) AS required_privileges,
      COALESCE(${forbiddenSql}, false) AS forbidden_privileges_absent
    FROM (SELECT 1) seed
    LEFT JOIN pg_namespace n ON n.nspname = current_schema()
    LEFT JOIN pg_class c
      ON c.relnamespace = n.oid
     AND c.relname = '${journeyDecisionTable}'
     AND c.relkind IN ('r', 'p')
  `, [roleName]);

  const row = result.rows[0];
  const tableExists = row?.table_exists === true;
  const protectedByForcedRls = row?.forced_rls === true;
  const nonOwner = row?.non_owner === true;
  const requiredPrivileges = row?.required_privileges === true;
  const forbiddenPrivilegesAbsent = row?.forbidden_privileges_absent === true;
  const ready = (
    migrationsPending.length === 0
    && baselineRoleReady
    && tableExists
    && protectedByForcedRls
    && nonOwner
    && requiredPrivileges
    && forbiddenPrivilegesAbsent
  );

  return {
    roleName,
    schemaName,
    migrationsPending,
    baselineRoleReady,
    tableExists,
    protectedByForcedRls,
    nonOwner,
    requiredPrivileges,
    forbiddenPrivilegesAbsent,
    ready,
  };
}

export async function planJourneyDatabaseRole(pool: Pool, roleName: string): Promise<JourneyDbRolePlan> {
  const migrationPlan = await planDatabaseMigrations(pool);
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  return withClient(pool, (client) => inspectJourneyRole(client, baseline.roleName, migrationPlan.pending, baseline.ready));
}

async function quoteRoleAndSchema(client: PoolClient, roleName: string) {
  const result = await client.query<{ role_ident: string; schema_ident: string }>(`
    SELECT quote_ident($1) AS role_ident, quote_ident(current_schema()) AS schema_ident
  `, [roleName]);
  const row = result.rows[0];
  if (!row) throw new JourneyDbRoleError("Unable to quote Journey role material", "JOURNEY_ROLE_APPLY_FAILED");
  return row;
}

async function requireActivationPreconditions(pool: Pool, roleName: string) {
  const migrationPlan = await planDatabaseMigrations(pool);
  if (migrationPlan.pending.length > 0) {
    throw new JourneyDbRoleError(
      "All Life OS migrations, including Journey migration 0008, must be applied before granting Journey authority",
      "MIGRATIONS_PENDING",
    );
  }
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  if (!baseline.ready) {
    throw new JourneyDbRoleError(
      "The baseline Life OS application role must satisfy its existing least-privilege contract first",
      "BASE_ROLE_NOT_READY",
    );
  }
  return baseline.roleName;
}

export async function applyJourneyDatabaseRole(pool: Pool, roleName: string): Promise<JourneyDbRolePlan> {
  const validatedRoleName = await requireActivationPreconditions(pool, roleName);

  return withClient(pool, async (client) => {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [journeyRoleLockName]);
    try {
      const before = await inspectJourneyRole(client, validatedRoleName, [], true);
      if (!before.tableExists || !before.protectedByForcedRls || !before.nonOwner) {
        throw new JourneyDbRoleError(
          "Journey table must exist with FORCE RLS and non-ownership before application authority is granted",
          "JOURNEY_TABLE_NOT_READY",
        );
      }

      const quoted = await quoteRoleAndSchema(client, validatedRoleName);
      await client.query("BEGIN");
      try {
        await client.query(
          `REVOKE ALL PRIVILEGES ON TABLE ${quoted.schema_ident}."${journeyDecisionTable}" FROM ${quoted.role_ident}`,
        );
        await client.query(
          `GRANT SELECT, INSERT, UPDATE ON TABLE ${quoted.schema_ident}."${journeyDecisionTable}" TO ${quoted.role_ident}`,
        );

        const after = await inspectJourneyRole(client, validatedRoleName, [], true);
        if (!after.ready) {
          throw new JourneyDbRoleError(
            "Journey capability did not satisfy the reviewed least-privilege contract",
            "JOURNEY_TABLE_NOT_READY",
          );
        }
        await client.query("COMMIT");
        return after;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (error instanceof JourneyDbRoleError) throw error;
        throw new JourneyDbRoleError("Journey capability provisioning failed", "JOURNEY_ROLE_APPLY_FAILED");
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [journeyRoleLockName]).catch(() => undefined);
    }
  });
}

export async function revokeJourneyDatabaseRole(pool: Pool, roleName: string): Promise<JourneyDbRolePlan> {
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  if (!baseline.roleExists) {
    throw new JourneyDbRoleError("Baseline application role does not exist", "BASE_ROLE_NOT_READY");
  }

  return withClient(pool, async (client) => {
    const quoted = await quoteRoleAndSchema(client, baseline.roleName);
    const relation = await client.query<{ exists: boolean }>(`
      SELECT to_regclass(format('%I.%I', current_schema(), '${journeyDecisionTable}')) IS NOT NULL AS exists
    `);
    if (relation.rows[0]?.exists === true) {
      await client.query(
        `REVOKE ALL PRIVILEGES ON TABLE ${quoted.schema_ident}."${journeyDecisionTable}" FROM ${quoted.role_ident}`,
      );
    }
    const migrationPlan = await planDatabaseMigrations(pool);
    return inspectJourneyRole(client, baseline.roleName, migrationPlan.pending, baseline.ready);
  });
}
