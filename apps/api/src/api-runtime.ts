import type { Pool } from "pg";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import { resolveRuntimeProvenance } from "./runtime-provenance";
import type { ReadinessProbe } from "./api-health";
import {
  forbiddenApplicationTablePrivileges,
  migrationLedgerTable,
  requiredApplicationTablePrivileges,
  requiredPrivateTables,
  userScopeFunction,
} from "./private-database-contract";

export class ApiRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiRuntimeConfigurationError";
  }
}

export interface DatabaseQueryResult {
  rows: Array<Record<string, unknown>>;
}

export interface DatabaseProbe {
  query(text: string): Promise<DatabaseQueryResult>;
}

const requiredPrivilegeSql = requiredApplicationTablePrivileges
  .map((privilege) => `has_table_privilege(current_user, c.oid, '${privilege}')`)
  .join("\n      AND ");
const forbiddenPrivilegeSql = forbiddenApplicationTablePrivileges
  .map((privilege) => `NOT has_table_privilege(current_user, c.oid, '${privilege}')`)
  .join("\n      AND ");

const privateRoleReadinessSql = `
WITH required_table(name) AS (
  VALUES ${requiredPrivateTables.map((name) => `('${name}')`).join(", ")}
)
SELECT
  r.rolsuper AS role_superuser,
  r.rolbypassrls AS role_bypass_rls,
  r.rolcreatedb AS role_create_db,
  r.rolcreaterole AS role_create_role,
  r.rolreplication AS role_replication,
  r.rolinherit AS role_inherit,
  has_schema_privilege(current_user, current_schema(), 'USAGE') AS schema_usage,
  has_schema_privilege(current_user, current_schema(), 'CREATE') AS schema_create,
  (SELECT count(*)::int FROM pg_auth_members membership WHERE membership.member = r.oid) AS role_memberships,
  count(c.oid)::int AS table_count,
  count(c.oid) FILTER (
    WHERE c.relrowsecurity
      AND c.relforcerowsecurity
      AND pg_get_userbyid(c.relowner) <> current_user
  )::int AS safe_table_count,
  count(c.oid) FILTER (
    WHERE ${requiredPrivilegeSql}
      AND ${forbiddenPrivilegeSql}
  )::int AS least_privilege_table_count
FROM pg_roles r
CROSS JOIN required_table required
LEFT JOIN pg_namespace n
  ON n.nspname = current_schema()
LEFT JOIN pg_class c
  ON c.relnamespace = n.oid
 AND c.relname = required.name
 AND c.relkind IN ('r', 'p')
WHERE r.rolname = current_user
GROUP BY
  r.oid,
  r.rolsuper,
  r.rolbypassrls,
  r.rolcreatedb,
  r.rolcreaterole,
  r.rolreplication,
  r.rolinherit
`;

const unscopedReadinessSql = `
SELECT
  ${userScopeFunction}() AS user_id,
  (SELECT count(*)::int FROM capture_record) AS visible_capture_rows,
  (
    COALESCE(has_table_privilege(current_user, to_regclass('${migrationLedgerTable}'), 'SELECT'), false)
    OR COALESCE(has_table_privilege(current_user, to_regclass('${migrationLedgerTable}'), 'INSERT'), false)
    OR COALESCE(has_table_privilege(current_user, to_regclass('${migrationLedgerTable}'), 'UPDATE'), false)
    OR COALESCE(has_table_privilege(current_user, to_regclass('${migrationLedgerTable}'), 'DELETE'), false)
    OR COALESCE(has_table_privilege(current_user, to_regclass('${migrationLedgerTable}'), 'TRUNCATE'), false)
    OR COALESCE(has_table_privilege(current_user, to_regclass('${migrationLedgerTable}'), 'REFERENCES'), false)
    OR COALESCE(has_table_privilege(current_user, to_regclass('${migrationLedgerTable}'), 'TRIGGER'), false)
  ) AS migration_ledger_access
`;

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function parsePort(value: string | undefined): number {
  const normalized = value?.trim() || "4000";
  if (!/^\d+$/.test(normalized)) throw new ApiRuntimeConfigurationError("PORT must be an integer between 1 and 65535");
  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ApiRuntimeConfigurationError("PORT must be an integer between 1 and 65535");
  }
  return port;
}

export function databaseUrlForRuntime(env: NodeJS.ProcessEnv): string | undefined {
  const value = optionalText(env.DATABASE_URL);
  if (value) return value;

  const environment = resolveRuntimeProvenance(env).environment;
  if (environment === "local") return undefined;
  throw new ApiRuntimeConfigurationError(`DATABASE_URL is required in ${environment}`);
}

/**
 * Private transport activation is a deliberate deployment decision, not an inference
 * from the presence of credentials. V1 is development/CI/local only; production stays
 * blocked until a separate production-security review is approved.
 */
export function privateApiEnabledForRuntime(
  env: NodeJS.ProcessEnv,
  provenance: RuntimeProvenance = resolveRuntimeProvenance(env),
): boolean {
  const value = optionalText(env.LIFE_OS_PRIVATE_API_ENABLED)?.toLowerCase();
  if (value === undefined || value === "false") return false;
  if (value !== "true") {
    throw new ApiRuntimeConfigurationError("LIFE_OS_PRIVATE_API_ENABLED must be true or false");
  }
  if (provenance.environment === "production") {
    throw new ApiRuntimeConfigurationError("Private API V1 cannot be activated in production");
  }
  return true;
}

export function createDatabaseReadinessProbe(database: DatabaseProbe | undefined): ReadinessProbe {
  if (!database) {
    return { async check() { return true; } };
  }

  return {
    async check() {
      await database.query("SELECT 1");
      return true;
    },
  };
}

/**
 * Hosted private runtime is ready only when the connected application role proves the
 * exact least-privilege boundary: no elevated role capabilities/memberships, schema
 * USAGE without CREATE, explicit CRUD on every private table without DDL-like table
 * privileges, FORCE RLS with non-ownership, no migration-ledger access, and an empty
 * unscoped user context that cannot see Capture rows.
 */
export function createPrivateDatabaseReadinessProbe(database: DatabaseProbe): ReadinessProbe {
  return {
    async check() {
      const roleResult = await database.query(privateRoleReadinessSql);
      if (roleResult.rows.length !== 1) return false;
      const role = roleResult.rows[0];
      if (role.role_superuser !== false || role.role_bypass_rls !== false) return false;
      if (role.role_create_db !== false || role.role_create_role !== false || role.role_replication !== false) return false;
      if (role.role_inherit !== false || role.role_memberships !== 0) return false;
      if (role.schema_usage !== true || role.schema_create !== false) return false;
      if (role.table_count !== requiredPrivateTables.length) return false;
      if (role.safe_table_count !== requiredPrivateTables.length) return false;
      if (role.least_privilege_table_count !== requiredPrivateTables.length) return false;

      const unscoped = await database.query(unscopedReadinessSql);
      if (unscoped.rows.length !== 1) return false;
      return (
        unscoped.rows[0].user_id === null &&
        unscoped.rows[0].visible_capture_rows === 0 &&
        unscoped.rows[0].migration_ledger_access === false
      );
    },
  };
}

export async function closePool(pool: Pick<Pool, "end"> | undefined): Promise<void> {
  if (pool) await pool.end();
}
