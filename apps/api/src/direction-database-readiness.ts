import type { ReadinessProbe } from "./api-health";
import type { DatabaseProbe } from "./api-runtime";
import {
  directionDecisionTable,
  forbiddenDirectionApplicationTablePrivileges,
  requiredDirectionApplicationTablePrivileges,
} from "./private-database-contract";

const requiredPrivilegeSql = requiredDirectionApplicationTablePrivileges
  .map((privilege) => `has_table_privilege(current_user, c.oid, '${privilege}')`)
  .join("\n      AND ");
const forbiddenPrivilegeSql = forbiddenDirectionApplicationTablePrivileges
  .map((privilege) => `NOT has_table_privilege(current_user, c.oid, '${privilege}')`)
  .join("\n      AND ");

const directionReadinessSql = `
SELECT
  c.oid IS NOT NULL AS table_exists,
  COALESCE(c.relrowsecurity, false) AS row_security,
  COALESCE(c.relforcerowsecurity, false) AS force_row_security,
  COALESCE(pg_get_userbyid(c.relowner) <> current_user, false) AS non_owner,
  COALESCE(${requiredPrivilegeSql}, false) AS required_privileges,
  COALESCE(${forbiddenPrivilegeSql}, false) AS forbidden_privileges_absent
FROM (SELECT 1) seed
LEFT JOIN pg_namespace n ON n.nspname = current_schema()
LEFT JOIN pg_class c
  ON c.relnamespace = n.oid
 AND c.relname = '${directionDecisionTable}'
 AND c.relkind IN ('r', 'p')
`;

const directionUnscopedSql = `SELECT count(*)::int AS visible_direction_rows FROM ${directionDecisionTable}`;

/**
 * Additional readiness proof for the opt-in high-authority Direction capability.
 * Baseline private readiness still validates the application role itself and the seven
 * ordinary private tables; this probe proves Direction exists with a strictly narrower
 * SELECT/INSERT/UPDATE grant and remains invisible without a user scope.
 */
export function createDirectionDatabaseReadinessProbe(database: DatabaseProbe): ReadinessProbe {
  return {
    async check() {
      const result = await database.query(directionReadinessSql);
      if (result.rows.length !== 1) return false;
      const row = result.rows[0];
      if (row.table_exists !== true) return false;
      if (row.row_security !== true || row.force_row_security !== true || row.non_owner !== true) return false;
      if (row.required_privileges !== true || row.forbidden_privileges_absent !== true) return false;

      const unscoped = await database.query(directionUnscopedSql);
      return unscoped.rows.length === 1 && unscoped.rows[0].visible_direction_rows === 0;
    },
  };
}

export function combineReadinessProbes(...probes: ReadinessProbe[]): ReadinessProbe {
  return {
    async check() {
      for (const probe of probes) {
        if (!(await probe.check())) return false;
      }
      return true;
    },
  };
}
