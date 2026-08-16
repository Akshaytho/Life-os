import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseProbe, DatabaseQueryResult } from "./api-runtime";
import {
  combineReadinessProbes,
  createDirectionDatabaseReadinessProbe,
} from "./direction-database-readiness";

class FixtureDatabase implements DatabaseProbe {
  readonly queries: string[] = [];

  constructor(private readonly results: DatabaseQueryResult[]) {}

  async query(text: string): Promise<DatabaseQueryResult> {
    this.queries.push(text);
    const next = this.results.shift();
    if (!next) throw new Error("Unexpected query");
    return next;
  }
}

function readyRoleResult(overrides: Record<string, unknown> = {}) {
  return {
    rows: [{
      table_exists: true,
      row_security: true,
      force_row_security: true,
      non_owner: true,
      required_privileges: true,
      forbidden_privileges_absent: true,
      ...overrides,
    }],
  };
}

test("Direction readiness requires protected table, exact privileges and zero unscoped visibility", async () => {
  const database = new FixtureDatabase([
    readyRoleResult(),
    { rows: [{ visible_direction_rows: 0 }] },
  ]);

  assert.equal(await createDirectionDatabaseReadinessProbe(database).check(), true);
  assert.equal(database.queries.length, 2);
  assert.match(database.queries[0]!, /direction_decision/);
  assert.match(database.queries[0]!, /SELECT/);
  assert.match(database.queries[0]!, /INSERT/);
  assert.match(database.queries[0]!, /UPDATE/);
  assert.match(database.queries[0]!, /DELETE/);
});

test("Direction readiness fails when migration table is absent", async () => {
  const database = new FixtureDatabase([readyRoleResult({ table_exists: false })]);
  assert.equal(await createDirectionDatabaseReadinessProbe(database).check(), false);
  assert.equal(database.queries.length, 1);
});

test("Direction readiness fails when FORCE RLS, non-ownership or narrow privilege contract drifts", async () => {
  for (const override of [
    { force_row_security: false },
    { non_owner: false },
    { required_privileges: false },
    { forbidden_privileges_absent: false },
  ]) {
    const database = new FixtureDatabase([readyRoleResult(override)]);
    assert.equal(await createDirectionDatabaseReadinessProbe(database).check(), false);
  }
});

test("Direction readiness fails when an unscoped app connection can see Direction rows", async () => {
  const database = new FixtureDatabase([
    readyRoleResult(),
    { rows: [{ visible_direction_rows: 1 }] },
  ]);
  assert.equal(await createDirectionDatabaseReadinessProbe(database).check(), false);
});

test("combined readiness short-circuits on the first failed boundary", async () => {
  const calls: string[] = [];
  const combined = combineReadinessProbes(
    { async check() { calls.push("baseline"); return false; } },
    { async check() { calls.push("direction"); return true; } },
  );
  assert.equal(await combined.check(), false);
  assert.deepEqual(calls, ["baseline"]);
});
