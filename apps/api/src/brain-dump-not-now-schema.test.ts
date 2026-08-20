import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(new URL(
  "../../../packages/database/migrations/0009_brain_dump_not_now.sql",
  import.meta.url,
));

test("migration 0009 encodes the reviewed private and reversible schema boundary", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of ["brain_dump_classification", "not_now_item"]) {
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, "i"));
    assert.match(sql, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`, "i"));
    assert.match(sql, new RegExp(`CREATE POLICY ${table}_user_policy`, "i"));
  }
  for (const value of [
    "TEMPORARY_INSPIRATION",
    "WORTH_RESEARCHING",
    "GENUINE_DIRECTION_CHANGE",
    "EMOTIONAL_REACTION",
    "UNSURE",
    "PARKED_NOT_NOW",
    "RESEARCHING",
    "DELAYED",
    "DISMISSED",
    "RELEASED_FOR_REVIEW",
  ]) assert.match(sql, new RegExp(`'${value}'`));

  assert.doesNotMatch(sql, /PROMOTED/);
  assert.match(sql, /UNIQUE \(user_id, request_id\)/);
  assert.match(sql, /not_now_item_one_current_per_capture_idx/);
  assert.match(sql, /brain_dump_classification_one_current_idx/);
  assert.match(sql, /classification_fk_idx/);
  assert.match(sql, /supersession_fk_idx/);
  assert.match(sql, /REVOKE ALL PRIVILEGES[\s\S]*FROM PUBLIC/i);
  assert.match(sql, /'anon', 'authenticated', 'service_role'/);
  assert.doesNotMatch(sql, /GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i);
});
