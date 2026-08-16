import type { Pool, PoolClient } from "pg";
import {
  applicationDbRolePlanConfigurationFromEnv,
  planApplicationDatabaseRole,
  type ApplicationDbRolePlanConfiguration,
} from "./application-db-role";
import { planDatabaseMigrations } from "./migration-runner";
import {
  directionDecisionTable,
  forbiddenDirectionApplicationTablePrivileges,
  requiredDirectionApplicationTablePrivileges,
} from "./private-database-contract";

const directionRoleLockName = "life-os-direction-role-v1";

export class DirectionDbRoleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CONFIGURATION_INVALID"
      | "MIGRATIONS_PENDING"
      | "BASE_ROLE_NOT_READY"
      | "DIRECTION_TABLE_NOT_READY"
      | "DIRECTION_ROLE_APPLY_FAILED",
  ) {
    super(message);
    this.name = "DirectionDbRoleError";
  }
}

export type DirectionDbRoleConfiguration = ApplicationDbRolePlanConfiguration;

export interface DirectionDbRolePlan {
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

export function directionDbRoleConfigurationFromEnv(env: NodeJS.ProcessEnv): DirectionDbRoleConfiguration {
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

async function inspectDirectionRole(
  client: PoolClient,
  roleName: string,
  migrationsPending: string[],
  baselineRoleReady: boolean,
): Promise<DirectionDbRolePlan> {
  const schemaResult = await client.query<{ schema_name: string }>("SELECT current_schema() AS schema_name");
  const schemaName = schemaResult.rows[0]?.schema_name ?? "";

  const requiredSql = requiredDirectionApplicationTablePrivileges
    .map((privilege) => `COALESCE(has_table_privilege($1, c.oid, '${privilege}'), false)`)
    .join("\n      AND ");
  const forbiddenSql = forbiddenDirectionApplicationTablePrivileges
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
     AND c.relname = '${directionDecisionTable}'
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

export async function planDirectionDatabaseRole(pool: Pool, roleName: string): Promise<DirectionDbRolePlan> {
  const migrationPlan = await planDatabaseMigrations(pool);
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  return withClient(pool, (client) => inspectDirectionRole(client, baseline.roleName, migrationPlan.pending, baseline.ready));
}

async function quoteRoleAndSchema(client: PoolClient, roleName: string) {
  const result = await client.query<{ role_ident: string; schema_ident: string }>(`
    SELECT quote_ident($1) AS role_ident, quote_ident(current_schema()) AS schema_ident
  `, [roleName]);
  const row = result.rows[0];
  if (!row) throw new DirectionDbRoleError("Unable to quote Direction role material", "DIRECTION_ROLE_APPLY_FAILED");
  return row;
}

async function requireActivationPreconditions(pool: Pool, roleName: string) {
  const migrationPlan = await planDatabaseMigrations(pool);
  if (migrationPlan.pending.length > 0) {
    throw new DirectionDbRoleError(
      "All Life OS migrations, including Direction migration 0007, must be applied before granting Direction authority",
      "MIGRATIONS_PENDING",
    );
  }
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  if (!baseline.ready) {
    throw new DirectionDbRoleError(
      "The baseline Life OS application role must satisfy its existing least-privilege contract first",
      "BASE_ROLE_NOT_READY",
    );
  }
  return baseline.roleName;
}

export async function applyDirectionDatabaseRole(pool: Pool, roleName: string): Promise<DirectionDbRolePlan> {
  const validatedRoleName = await requireActivationPreconditions(pool, roleName);

  return withClient(pool, async (client) => {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [directionRoleLockName]);
    try {
      const before = await inspectDirectionRole(client, validatedRoleName, [], true);
      if (!before.tableExists || !before.protectedByForcedRls || !before.nonOwner) {
        throw new DirectionDbRoleError(
          "Direction table must exist with FORCE RLS and non-ownership before application authority is granted",
          "DIRECTION_TABLE_NOT_READY",
        );
      }

      const quoted = await quoteRoleAndSchema(client, validatedRoleName);
      await client.query("BEGIN");
      try {
        await client.query(
          `REVOKE ALL PRIVILEGES ON TABLE ${quoted.schema_ident}."${directionDecisionTable}" FROM ${quoted.role_ident}`,
        );
        await client.query(
          `GRANT SELECT, INSERT, UPDATE ON TABLE ${quoted.schema_ident}."${directionDecisionTable}" TO ${quoted.role_ident}`,
        );

        const after = await inspectDirectionRole(client, validatedRoleName, [], true);
        if (!after.ready) {
          throw new DirectionDbRoleError(
            "Direction capability did not satisfy the reviewed least-privilege contract",
            "DIRECTION_TABLE_NOT_READY",
          );
        }
        await client.query("COMMIT");
        return after;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (error instanceof DirectionDbRoleError) throw error;
        throw new DirectionDbRoleError("Direction capability provisioning failed", "DIRECTION_ROLE_APPLY_FAILED");
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [directionRoleLockName]).catch(() => undefined);
    }
  });
}

export async function revokeDirectionDatabaseRole(pool: Pool, roleName: string): Promise<DirectionDbRolePlan> {
  const baseline = await planApplicationDatabaseRole(pool, roleName);
  if (!baseline.roleExists) {
    throw new DirectionDbRoleError("Baseline application role does not exist", "BASE_ROLE_NOT_READY");
  }

  return withClient(pool, async (client) => {
    const quoted = await quoteRoleAndSchema(client, baseline.roleName);
    const relation = await client.query<{ exists: boolean }>(`
      SELECT to_regclass(format('%I.%I', current_schema(), '${directionDecisionTable}')) IS NOT NULL AS exists
    `);
    if (relation.rows[0]?.exists === true) {
      await client.query(
        `REVOKE ALL PRIVILEGES ON TABLE ${quoted.schema_ident}."${directionDecisionTable}" FROM ${quoted.role_ident}`,
      );
    }
    const migrationPlan = await planDatabaseMigrations(pool);
    return inspectDirectionRole(client, baseline.roleName, migrationPlan.pending, baseline.ready);
  });
}
