import type { Pool } from "pg";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import { resolveRuntimeProvenance } from "./runtime-provenance";
import type { ReadinessProbe } from "./api-health";

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

const requiredPrivateTables = [
  "capture_record",
  "routing_interpretation",
  "routing_proposal",
  "calendar_event",
  "domain_event",
  "applied_proposal",
  "proposal_rejection",
] as const;

const privateRoleReadinessSql = `
WITH required_table(name) AS (
  VALUES ${requiredPrivateTables.map((name) => `('${name}')`).join(", ")}
)
SELECT
  r.rolsuper AS role_superuser,
  r.rolbypassrls AS role_bypass_rls,
  count(c.oid)::int AS table_count,
  count(c.oid) FILTER (
    WHERE c.relrowsecurity
      AND c.relforcerowsecurity
      AND pg_get_userbyid(c.relowner) <> current_user
  )::int AS safe_table_count
FROM pg_roles r
CROSS JOIN required_table required
LEFT JOIN pg_namespace n
  ON n.nspname = current_schema()
LEFT JOIN pg_class c
  ON c.relnamespace = n.oid
 AND c.relname = required.name
 AND c.relkind IN ('r', 'p')
WHERE r.rolname = current_user
GROUP BY r.rolsuper, r.rolbypassrls
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
 * Hosted private runtime is only ready when the connected application role itself
 * proves the intended authorization boundary: no superuser/bypass-RLS authority,
 * no ownership of private tables, FORCE RLS on every required private table, and an
 * empty unscoped user context that cannot see Capture rows.
 */
export function createPrivateDatabaseReadinessProbe(database: DatabaseProbe): ReadinessProbe {
  return {
    async check() {
      const roleResult = await database.query(privateRoleReadinessSql);
      if (roleResult.rows.length !== 1) return false;
      const role = roleResult.rows[0];
      if (role.role_superuser !== false || role.role_bypass_rls !== false) return false;
      if (role.table_count !== requiredPrivateTables.length) return false;
      if (role.safe_table_count !== requiredPrivateTables.length) return false;

      const unscoped = await database.query(
        "SELECT lifeos_current_user_id() AS user_id, (SELECT count(*)::int FROM capture_record) AS visible_capture_rows",
      );
      if (unscoped.rows.length !== 1) return false;
      return unscoped.rows[0].user_id === null && unscoped.rows[0].visible_capture_rows === 0;
    },
  };
}

export async function closePool(pool: Pick<Pool, "end"> | undefined): Promise<void> {
  if (pool) await pool.end();
}
