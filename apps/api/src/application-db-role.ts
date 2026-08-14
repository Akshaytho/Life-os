import type { Pool, PoolClient } from "pg";
import {
  forbiddenApplicationTablePrivileges,
  migrationLedgerTable,
  requiredApplicationTablePrivileges,
  requiredPrivateTables,
  userScopeFunction,
} from "./private-database-contract";
import {
  migrationRuntimeConfigurationFromEnv,
  planDatabaseMigrations,
} from "./migration-runner";

const applicationRoleLockName = "life-os-application-role-v1";
const defaultApplicationRole = "lifeos_app";
const safeRoleNamePattern = /^[a-z][a-z0-9_]{2,31}$/;

export class ApplicationDbRoleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CONFIGURATION_INVALID"
      | "MIGRATIONS_PENDING"
      | "ROLE_STATE_UNSAFE"
      | "ROLE_APPLY_FAILED",
  ) {
    super(message);
    this.name = "ApplicationDbRoleError";
  }
}

export interface ApplicationDbRolePlanConfiguration {
  migrationDatabaseUrl: string;
  environment: "local" | "ci" | "development";
  roleName: string;
}

export interface ApplicationDbRoleApplyConfiguration extends ApplicationDbRolePlanConfiguration {
  password: string;
}

export interface ApplicationDbRolePlan {
  roleName: string;
  schemaName: string;
  migrationsPending: string[];
  roleExists: boolean;
  roleAttributesSafe: boolean;
  roleMemberships: number;
  schemaUsage: boolean;
  schemaCreate: boolean;
  privateTableCount: number;
  protectedTableCount: number;
  leastPrivilegeTableCount: number;
  userScopeExecute: boolean;
  migrationLedgerAccess: boolean;
  ready: boolean;
}

export interface ApplicationDbRoleApplyReceipt extends ApplicationDbRolePlan {
  passwordApplied: true;
}

interface RoleRow {
  oid: number;
  rolcanlogin: boolean;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolinherit: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function validateRoleName(value: string | undefined): string {
  const roleName = optionalText(value) ?? defaultApplicationRole;
  if (!safeRoleNamePattern.test(roleName)) {
    throw new ApplicationDbRoleError(
      "LIFE_OS_APPLICATION_DB_ROLE must be a lowercase Postgres identifier between 3 and 32 characters",
      "CONFIGURATION_INVALID",
    );
  }
  if (
    roleName === "postgres" ||
    roleName === "anon" ||
    roleName === "authenticated" ||
    roleName === "authenticator" ||
    roleName === "service_role" ||
    roleName.startsWith("pg_") ||
    roleName.startsWith("supabase_")
  ) {
    throw new ApplicationDbRoleError(
      "LIFE_OS_APPLICATION_DB_ROLE must not reuse a Postgres or Supabase managed role",
      "CONFIGURATION_INVALID",
    );
  }
  return roleName;
}

function validatePassword(value: string | undefined, roleName: string): string {
  if (!value || value.length < 24) {
    throw new ApplicationDbRoleError(
      "LIFE_OS_APPLICATION_DB_PASSWORD must contain at least 24 characters",
      "CONFIGURATION_INVALID",
    );
  }
  if (/[\u0000-\u001f\u007f]/.test(value) || value.toLowerCase().includes(roleName.toLowerCase())) {
    throw new ApplicationDbRoleError(
      "LIFE_OS_APPLICATION_DB_PASSWORD must not contain control characters or the database role name",
      "CONFIGURATION_INVALID",
    );
  }
  return value;
}

export function applicationDbRolePlanConfigurationFromEnv(
  env: NodeJS.ProcessEnv,
): ApplicationDbRolePlanConfiguration {
  const migration = migrationRuntimeConfigurationFromEnv(env);
  return {
    migrationDatabaseUrl: migration.migrationDatabaseUrl,
    environment: migration.environment,
    roleName: validateRoleName(env.LIFE_OS_APPLICATION_DB_ROLE),
  };
}

export function applicationDbRoleApplyConfigurationFromEnv(
  env: NodeJS.ProcessEnv,
): ApplicationDbRoleApplyConfiguration {
  const plan = applicationDbRolePlanConfigurationFromEnv(env);
  return {
    ...plan,
    password: validatePassword(env.LIFE_OS_APPLICATION_DB_PASSWORD, plan.roleName),
  };
}

async function inspectApplicationRole(
  client: PoolClient,
  roleName: string,
  migrationsPending: string[],
): Promise<ApplicationDbRolePlan> {
  const schemaResult = await client.query<{ schema_name: string }>("SELECT current_schema() AS schema_name");
  const schemaName = schemaResult.rows[0]?.schema_name ?? "";
  const roleResult = await client.query<RoleRow>(`
    SELECT oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls
    FROM pg_roles
    WHERE rolname = $1
  `, [roleName]);

  if (roleResult.rows.length === 0) {
    return {
      roleName,
      schemaName,
      migrationsPending,
      roleExists: false,
      roleAttributesSafe: false,
      roleMemberships: 0,
      schemaUsage: false,
      schemaCreate: false,
      privateTableCount: 0,
      protectedTableCount: 0,
      leastPrivilegeTableCount: 0,
      userScopeExecute: false,
      migrationLedgerAccess: false,
      ready: false,
    };
  }

  const role = roleResult.rows[0];
  const roleAttributesSafe = (
    role.rolcanlogin === true &&
    role.rolsuper === false &&
    role.rolcreatedb === false &&
    role.rolcreaterole === false &&
    role.rolinherit === false &&
    role.rolreplication === false &&
    role.rolbypassrls === false
  );

  const membershipResult = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM pg_auth_members WHERE member = $1",
    [role.oid],
  );
  const roleMemberships = membershipResult.rows[0]?.count ?? 0;

  const schemaPrivileges = await client.query<{ usage: boolean; create: boolean }>(`
    SELECT
      has_schema_privilege($1, current_schema(), 'USAGE') AS usage,
      has_schema_privilege($1, current_schema(), 'CREATE') AS create
  `, [roleName]);
  const schemaUsage = schemaPrivileges.rows[0]?.usage === true;
  const schemaCreate = schemaPrivileges.rows[0]?.create === true;

  const requiredPrivilegeSql = requiredApplicationTablePrivileges
    .map((privilege) => `has_table_privilege($1, c.oid, '${privilege}')`)
    .join("\n        AND ");
  const forbiddenPrivilegeSql = forbiddenApplicationTablePrivileges
    .map((privilege) => `NOT has_table_privilege($1, c.oid, '${privilege}')`)
    .join("\n        AND ");

  const tableResult = await client.query<{
    private_table_count: number;
    protected_table_count: number;
    least_privilege_table_count: number;
  }>(`
    WITH required_table(name) AS (
      VALUES ${requiredPrivateTables.map((name) => `('${name}')`).join(", ")}
    )
    SELECT
      count(c.oid)::int AS private_table_count,
      count(c.oid) FILTER (
        WHERE c.relrowsecurity
          AND c.relforcerowsecurity
          AND pg_get_userbyid(c.relowner) <> $1
      )::int AS protected_table_count,
      count(c.oid) FILTER (
        WHERE ${requiredPrivilegeSql}
          AND ${forbiddenPrivilegeSql}
      )::int AS least_privilege_table_count
    FROM required_table required
    LEFT JOIN pg_namespace n ON n.nspname = current_schema()
    LEFT JOIN pg_class c
      ON c.relnamespace = n.oid
     AND c.relname = required.name
     AND c.relkind IN ('r', 'p')
  `, [roleName]);
  const table = tableResult.rows[0];
  const privateTableCount = table?.private_table_count ?? 0;
  const protectedTableCount = table?.protected_table_count ?? 0;
  const leastPrivilegeTableCount = table?.least_privilege_table_count ?? 0;

  const functionResult = await client.query<{ can_execute: boolean }>(`
    SELECT COALESCE(
      has_function_privilege(
        $1,
        to_regprocedure(format('%I.${userScopeFunction}()', current_schema())),
        'EXECUTE'
      ),
      false
    ) AS can_execute
  `, [roleName]);
  const userScopeExecute = functionResult.rows[0]?.can_execute === true;

  const ledgerResult = await client.query<{ has_access: boolean }>(`
    SELECT (
      COALESCE(has_table_privilege($1, to_regclass('${migrationLedgerTable}'), 'SELECT'), false)
      OR COALESCE(has_table_privilege($1, to_regclass('${migrationLedgerTable}'), 'INSERT'), false)
      OR COALESCE(has_table_privilege($1, to_regclass('${migrationLedgerTable}'), 'UPDATE'), false)
      OR COALESCE(has_table_privilege($1, to_regclass('${migrationLedgerTable}'), 'DELETE'), false)
      OR COALESCE(has_table_privilege($1, to_regclass('${migrationLedgerTable}'), 'TRUNCATE'), false)
      OR COALESCE(has_table_privilege($1, to_regclass('${migrationLedgerTable}'), 'REFERENCES'), false)
      OR COALESCE(has_table_privilege($1, to_regclass('${migrationLedgerTable}'), 'TRIGGER'), false)
    ) AS has_access
  `, [roleName]);
  const migrationLedgerAccess = ledgerResult.rows[0]?.has_access === true;

  const ready = (
    migrationsPending.length === 0 &&
    roleAttributesSafe &&
    roleMemberships === 0 &&
    schemaUsage &&
    !schemaCreate &&
    privateTableCount === requiredPrivateTables.length &&
    protectedTableCount === requiredPrivateTables.length &&
    leastPrivilegeTableCount === requiredPrivateTables.length &&
    userScopeExecute &&
    !migrationLedgerAccess
  );

  return {
    roleName,
    schemaName,
    migrationsPending,
    roleExists: true,
    roleAttributesSafe,
    roleMemberships,
    schemaUsage,
    schemaCreate,
    privateTableCount,
    protectedTableCount,
    leastPrivilegeTableCount,
    userScopeExecute,
    migrationLedgerAccess,
    ready,
  };
}

async function withClient<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

export async function planApplicationDatabaseRole(
  pool: Pool,
  roleName: string,
): Promise<ApplicationDbRolePlan> {
  const migrationPlan = await planDatabaseMigrations(pool);
  return withClient(pool, (client) => inspectApplicationRole(client, roleName, migrationPlan.pending));
}

async function quotedRoleMaterial(client: PoolClient, roleName: string, password: string) {
  const result = await client.query<{
    role_ident: string;
    schema_ident: string;
    password_literal: string;
  }>(`
    SELECT
      quote_ident($1) AS role_ident,
      quote_ident(current_schema()) AS schema_ident,
      quote_literal($2) AS password_literal
  `, [roleName, password]);
  const row = result.rows[0];
  if (!row) throw new ApplicationDbRoleError("Unable to quote application role material", "ROLE_APPLY_FAILED");
  return row;
}

export async function applyApplicationDatabaseRole(
  pool: Pool,
  roleName: string,
  password: string,
): Promise<ApplicationDbRoleApplyReceipt> {
  const migrationPlan = await planDatabaseMigrations(pool);
  if (migrationPlan.pending.length > 0) {
    throw new ApplicationDbRoleError(
      "All Life OS migrations must be applied before provisioning the application role",
      "MIGRATIONS_PENDING",
    );
  }

  return withClient(pool, async (client) => {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [applicationRoleLockName]);
    try {
      const before = await inspectApplicationRole(client, roleName, []);
      if (before.roleExists && before.roleMemberships > 0) {
        throw new ApplicationDbRoleError(
          "Existing application role has role memberships and must be reviewed manually",
          "ROLE_STATE_UNSAFE",
        );
      }

      const quoted = await quotedRoleMaterial(client, roleName, password);
      await client.query("BEGIN");
      try {
        if (!before.roleExists) {
          await client.query(`
            CREATE ROLE ${quoted.role_ident}
            WITH LOGIN PASSWORD ${quoted.password_literal}
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
          `);
        } else {
          await client.query(`
            ALTER ROLE ${quoted.role_ident}
            WITH LOGIN PASSWORD ${quoted.password_literal}
            NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
          `);
        }

        await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA ${quoted.schema_ident} FROM ${quoted.role_ident}`);
        await client.query(`GRANT USAGE ON SCHEMA ${quoted.schema_ident} TO ${quoted.role_ident}`);

        for (const table of requiredPrivateTables) {
          const tableIdent = `"${table}"`;
          await client.query(`REVOKE ALL PRIVILEGES ON TABLE ${quoted.schema_ident}.${tableIdent} FROM ${quoted.role_ident}`);
          await client.query(
            `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${quoted.schema_ident}.${tableIdent} TO ${quoted.role_ident}`,
          );
        }

        const ledger = await client.query<{ ledger: string | null }>(
          `SELECT to_regclass('${migrationLedgerTable}')::text AS ledger`,
        );
        if (ledger.rows[0]?.ledger) {
          await client.query(
            `REVOKE ALL PRIVILEGES ON TABLE ${quoted.schema_ident}."${migrationLedgerTable}" FROM ${quoted.role_ident}`,
          );
        }

        await client.query(
          `GRANT EXECUTE ON FUNCTION ${quoted.schema_ident}."${userScopeFunction}"() TO ${quoted.role_ident}`,
        );

        const after = await inspectApplicationRole(client, roleName, []);
        if (!after.ready) {
          throw new ApplicationDbRoleError(
            "Application role did not satisfy the Life OS least-privilege contract",
            "ROLE_STATE_UNSAFE",
          );
        }

        await client.query("COMMIT");
        return { ...after, passwordApplied: true as const };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (error instanceof ApplicationDbRoleError) throw error;
        throw new ApplicationDbRoleError("Application role provisioning failed", "ROLE_APPLY_FAILED");
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [applicationRoleLockName]).catch(() => undefined);
    }
  });
}
