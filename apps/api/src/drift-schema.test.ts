import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(new URL(
  "../../../packages/database/migrations/0010_drift_return.sql",
  import.meta.url,
));

test("migration 0010 encodes the reviewed private and reversible Drift boundary", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of ["drift_occurrence", "drift_decision"]) {
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, "i"));
    assert.match(sql, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`, "i"));
    assert.match(sql, new RegExp(`CREATE POLICY ${table}_user_policy`, "i"));
  }
  for (const value of [
    "TEMPORARY_INSPIRATION",
    "COMPARISON",
    "AVOIDANCE",
    "EMOTIONAL_REACTION",
    "GENUINE_RECONSIDERATION",
    "UNSURE",
    "STILL_RETURNING",
    "RETURN_TO_DIRECTION",
    "PARK_IDEA",
    "REFLECT_ONLY",
    "ADJUST_PLAN",
    "DELIBERATE_RECONSIDERATION",
    "UNDERSTOOD",
    "RESOLVED",
  ]) assert.match(sql, new RegExp(`'${value}'`));

  assert.match(sql, /UNIQUE \(user_id, request_id\)/);
  assert.match(sql, /drift_decision_one_current_idx/);
  assert.match(sql, /drift_decision_drift_fk_idx/);
  assert.match(sql, /drift_decision_supersession_fk_idx/);
  assert.match(sql, /authority_class text NOT NULL CHECK \(authority_class = 'DECISION'\)/);
  assert.match(sql, /REVOKE ALL PRIVILEGES[\s\S]*FROM PUBLIC/i);
  assert.match(sql, /'anon', 'authenticated', 'service_role'/);
  assert.doesNotMatch(sql, /GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS (goal|project|calendar|direction)_/i);
});
