import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseProbe } from "./api-runtime";
import { createAiRetrievalDatabaseReadinessProbe } from "./ai-retrieval-database-readiness";

function database(memoryCount = 0) {
  const sql: string[] = [];
  const value: DatabaseProbe = {
    async query(statement) {
      sql.push(statement);
      if (statement.includes("WITH required_table")) {
        const names = [...statement.matchAll(/\('([^']+)'\)/g)].map((match) => match[1]!);
        return {
          rows: names.map((table_name) => ({
            table_name,
            table_exists: true,
            row_security: true,
            force_row_security: true,
            non_owner: true,
            can_select: true,
          })),
        };
      }
      return {
        rows: [{
          calendar_count: 0,
          capture_count: 0,
          direction_count: 0,
          daily_log_count: 0,
          daily_review_count: 0,
          not_now_count: 0,
          drift_count: 0,
          journey_count: 0,
          practice_count: 0,
          ...(statement.includes("memory_count") ? { memory_count: memoryCount } : {}),
        }],
      };
    },
  };
  return { value, sql };
}

test("Ask readiness omits Memory when the independent capability is disabled", async () => {
  const fixture = database();
  assert.equal(await createAiRetrievalDatabaseReadinessProbe(fixture.value).check(), true);
  assert.equal(fixture.sql.some((sql) => sql.includes("memory_item")), false);
});

test("Ask readiness proves Memory RLS and unscoped invisibility when Memory is composed", async () => {
  const ready = database();
  assert.equal(await createAiRetrievalDatabaseReadinessProbe(ready.value, true).check(), true);
  assert.equal(ready.sql.every((sql) => sql.includes("memory_item")), true);

  const visible = database(1);
  assert.equal(await createAiRetrievalDatabaseReadinessProbe(visible.value, true).check(), false);
});
