import type { ReadinessProbe } from "./api-health";
import type { DatabaseProbe } from "./api-runtime";
import {
  brainDumpClassificationTable,
  dailyLogEntryTable,
  dailyReturnReviewTable,
  directionDecisionTable,
  driftDecisionTable,
  driftOccurrenceTable,
  journeyCapabilityDecisionTable,
  journeyPracticeCompletionTable,
  journeyPracticeSessionTable,
  memoryItemTable,
  notNowItemTable,
} from "./private-database-contract";

const baselineTables = [
  "calendar_event",
  "capture_record",
  directionDecisionTable,
  dailyLogEntryTable,
  dailyReturnReviewTable,
  brainDumpClassificationTable,
  notNowItemTable,
  driftOccurrenceTable,
  driftDecisionTable,
  journeyCapabilityDecisionTable,
  journeyPracticeSessionTable,
  journeyPracticeCompletionTable,
] as const;

function retrievalTables(includeMemory: boolean): readonly string[] {
  return includeMemory ? [...baselineTables, memoryItemTable] : baselineTables;
}

function readinessSql(tables: readonly string[]) { return `
WITH required_table(table_name) AS (
  VALUES ${tables.map((table) => `('${table}')`).join(", ")}
)
SELECT required.table_name,
       c.oid IS NOT NULL AS table_exists,
       COALESCE(c.relrowsecurity, false) AS row_security,
       COALESCE(c.relforcerowsecurity, false) AS force_row_security,
       COALESCE(pg_get_userbyid(c.relowner) <> current_user, false) AS non_owner,
       COALESCE(has_table_privilege(current_user, c.oid, 'SELECT'), false) AS can_select
  FROM required_table required
  LEFT JOIN pg_namespace n ON n.nspname = current_schema()
  LEFT JOIN pg_class c
    ON c.relnamespace = n.oid
   AND c.relname = required.table_name
   AND c.relkind IN ('r', 'p')
 ORDER BY required.table_name
` }

function unscopedSql(includeMemory: boolean) { return `
SELECT
  (SELECT count(*)::int FROM calendar_event) AS calendar_count,
  (SELECT count(*)::int FROM capture_record) AS capture_count,
  (SELECT count(*)::int FROM ${directionDecisionTable}) AS direction_count,
  (SELECT count(*)::int FROM ${dailyLogEntryTable}) AS daily_log_count,
  (SELECT count(*)::int FROM ${dailyReturnReviewTable}) AS daily_review_count,
  (SELECT count(*)::int FROM ${notNowItemTable}) AS not_now_count,
  (SELECT count(*)::int FROM ${driftOccurrenceTable}) AS drift_count,
  (SELECT count(*)::int FROM ${journeyCapabilityDecisionTable}) AS journey_count,
  (SELECT count(*)::int FROM ${journeyPracticeSessionTable}) AS practice_count
  ${includeMemory ? `, (SELECT count(*)::int FROM ${memoryItemTable}) AS memory_count` : ""}
` }

export function createAiRetrievalDatabaseReadinessProbe(
  database: DatabaseProbe,
  includeMemory = false,
): ReadinessProbe {
  return {
    async check() {
      const tables = retrievalTables(includeMemory);
      const result = await database.query(readinessSql(tables));
      if (result.rows.length !== tables.length) return false;
      if (result.rows.some((row) => (
        row.table_exists !== true
        || row.row_security !== true
        || row.force_row_security !== true
        || row.non_owner !== true
        || row.can_select !== true
      ))) return false;
      const unscoped = await database.query(unscopedSql(includeMemory));
      if (unscoped.rows.length !== 1) return false;
      return Object.values(unscoped.rows[0] ?? {}).every((value) => value === 0);
    },
  };
}
