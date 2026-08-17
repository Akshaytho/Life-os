import type { ReadinessProbe } from "./api-health";
import type { DatabaseProbe } from "./api-runtime";
import {
  forbiddenJourneyApplicationTablePrivileges,
  journeyDecisionTable,
  requiredJourneyApplicationTablePrivileges,
} from "./private-database-contract";

const requiredPrivilegeSql = requiredJourneyApplicationTablePrivileges
  .map((privilege) => `has_table_privilege(current_user, c.oid, '${privilege}')`)
  .join("\n      AND ");
const forbiddenPrivilegeSql = forbiddenJourneyApplicationTablePrivileges
  .map((privilege) => `NOT has_table_privilege(current_user, c.oid, '${privilege}')`)
  .join("\n      AND ");

const journeyReadinessSql = `
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
 AND c.relname = '${journeyDecisionTable}'
 AND c.relkind IN ('r', 'p')
`;

const journeyUnscopedSql = `SELECT count(*)::int AS visible_journey_rows FROM ${journeyDecisionTable}`;

export function createJourneyDatabaseReadinessProbe(database: DatabaseProbe): ReadinessProbe {
  return {
    async check() {
      const result = await database.query(journeyReadinessSql);
      if (result.rows.length !== 1) return false;
      const row = result.rows[0];
      if (row.table_exists !== true) return false;
      if (row.row_security !== true || row.force_row_security !== true || row.non_owner !== true) return false;
      if (row.required_privileges !== true || row.forbidden_privileges_absent !== true) return false;

      const unscoped = await database.query(journeyUnscopedSql);
      return unscoped.rows.length === 1 && unscoped.rows[0].visible_journey_rows === 0;
    },
  };
}
