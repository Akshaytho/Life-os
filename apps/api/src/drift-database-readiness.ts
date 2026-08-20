import type { ReadinessProbe } from "./api-health";
import type { DatabaseProbe } from "./api-runtime";
import { driftDecisionTable, driftOccurrenceTable } from "./private-database-contract";

const readinessSql = `
WITH required_table(table_name) AS (
  VALUES ('${driftOccurrenceTable}'), ('${driftDecisionTable}')
)
SELECT required.table_name,
       c.oid IS NOT NULL AS table_exists,
       COALESCE(c.relrowsecurity, false) AS row_security,
       COALESCE(c.relforcerowsecurity, false) AS force_row_security,
       COALESCE(pg_get_userbyid(c.relowner) <> current_user, false) AS non_owner,
       COALESCE(has_table_privilege(current_user, c.oid, 'SELECT'), false) AS can_select,
       COALESCE(has_table_privilege(current_user, c.oid, 'INSERT'), false) AS can_insert,
       COALESCE(has_table_privilege(current_user, c.oid, 'UPDATE'), false) AS can_update,
       COALESCE(has_table_privilege(current_user, c.oid, 'DELETE'), false) AS can_delete,
       COALESCE(has_table_privilege(current_user, c.oid, 'TRUNCATE'), false) AS can_truncate,
       COALESCE(has_table_privilege(current_user, c.oid, 'REFERENCES'), false) AS can_references,
       COALESCE(has_table_privilege(current_user, c.oid, 'TRIGGER'), false) AS can_trigger
  FROM required_table required
  LEFT JOIN pg_namespace n ON n.nspname = current_schema()
  LEFT JOIN pg_class c
    ON c.relnamespace = n.oid
   AND c.relname = required.table_name
   AND c.relkind IN ('r', 'p')
 ORDER BY required.table_name
`;

const unscopedSql = `
SELECT
  (SELECT count(*)::int FROM ${driftOccurrenceTable}) AS visible_occurrences,
  (SELECT count(*)::int FROM ${driftDecisionTable}) AS visible_decisions
`;

export function createDriftDatabaseReadinessProbe(database: DatabaseProbe): ReadinessProbe {
  return {
    async check() {
      const result = await database.query(readinessSql);
      if (result.rows.length !== 2) return false;
      for (const row of result.rows) {
        if (row.table_exists !== true) return false;
        if (
          row.row_security !== true
          || row.force_row_security !== true
          || row.non_owner !== true
          || row.can_select !== true
          || row.can_insert !== true
          || row.can_update !== (row.table_name === driftDecisionTable)
          || row.can_delete === true
          || row.can_truncate === true
          || row.can_references === true
          || row.can_trigger === true
        ) return false;
      }
      const unscoped = await database.query(unscopedSql);
      return unscoped.rows.length === 1
        && unscoped.rows[0].visible_occurrences === 0
        && unscoped.rows[0].visible_decisions === 0;
    },
  };
}
