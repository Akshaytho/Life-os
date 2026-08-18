import type { ReadinessProbe } from "./api-health";
import type { DatabaseProbe } from "./api-runtime";
import { memoryItemTable } from "./private-database-contract";

const readinessSql = `
SELECT c.oid IS NOT NULL AS table_exists,
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
  FROM (SELECT 1) required
  LEFT JOIN pg_namespace n ON n.nspname = current_schema()
  LEFT JOIN pg_class c ON c.relnamespace = n.oid
    AND c.relname = '${memoryItemTable}' AND c.relkind IN ('r', 'p')
`;

export function createMemoryDatabaseReadinessProbe(database: DatabaseProbe): ReadinessProbe {
  return {
    async check() {
      const result = await database.query(readinessSql);
      const row = result.rows[0];
      if (!row || result.rows.length !== 1 || row.table_exists !== true
        || row.row_security !== true || row.force_row_security !== true
        || row.non_owner !== true || row.can_select !== true
        || row.can_insert !== true || row.can_update !== true
        || row.can_delete === true || row.can_truncate === true
        || row.can_references === true || row.can_trigger === true) return false;
      const unscoped = await database.query(`SELECT count(*)::int AS visible_memories FROM ${memoryItemTable}`);
      return unscoped.rows.length === 1 && unscoped.rows[0].visible_memories === 0;
    },
  };
}
