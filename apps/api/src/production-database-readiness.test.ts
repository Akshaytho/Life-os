import assert from "node:assert/strict";
import test from "node:test";
import { allPrivateTables } from "./private-database-contract";
import { createProductionDatabaseReadinessProbe } from "./production-database-readiness";

const ready = {
  table_count: allPrivateTables.length,
  protected_table_count: allPrivateTables.length,
  api_inaccessible_table_count: allPrivateTables.length,
  scope_function_safe: true,
  future_objects_private: true,
};

test("production readiness proves every table and future object stays private", async () => {
  const queries: string[] = [];
  const probe = createProductionDatabaseReadinessProbe({
    async query(text) {
      queries.push(text);
      return { rows: [ready] };
    },
  });

  assert.equal(await probe.check(), true);
  assert.equal(queries.length, 1);
  for (const table of allPrivateTables) assert.match(queries[0]!, new RegExp(table));
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.match(queries[0]!, new RegExp(role));
  }
  assert.match(queries[0]!, /search_path/);
  assert.match(queries[0]!, /pg_default_acl/);
});

test("production readiness fails closed on every security dimension", async () => {
  const unsafeRows = [
    { ...ready, table_count: allPrivateTables.length - 1 },
    { ...ready, protected_table_count: allPrivateTables.length - 1 },
    { ...ready, api_inaccessible_table_count: allPrivateTables.length - 1 },
    { ...ready, scope_function_safe: false },
    { ...ready, future_objects_private: false },
  ];

  for (const row of unsafeRows) {
    const probe = createProductionDatabaseReadinessProbe({
      async query() { return { rows: [row] }; },
    });
    assert.equal(await probe.check(), false);
  }
});

test("production readiness rejects malformed result cardinality", async () => {
  for (const rows of [[], [ready, ready]]) {
    const probe = createProductionDatabaseReadinessProbe({
      async query() { return { rows }; },
    });
    assert.equal(await probe.check(), false);
  }
});
