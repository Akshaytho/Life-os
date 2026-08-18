import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../../../packages/database/migrations/0013_memory_activation.sql", import.meta.url);

test("Memory schema is versioned, source-linked, forced-RLS, and non-destructive", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS memory_item/);
  assert.match(sql, /revision integer NOT NULL CHECK \(revision > 0\)/);
  assert.match(sql, /authority_class = 'REFLECTION'/);
  assert.match(sql, /source_domain IN \('PERIODIC_REVIEW', 'JOURNEY_PRACTICE'\)/);
  assert.match(sql, /relationship IN \('NEW', 'REINFORCES', 'MODIFIES', 'CONTRADICTS'\)/);
  assert.match(sql, /memory_item_one_current_root_idx/);
  assert.match(sql, /memory_item_one_current_source_idx/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /lifeos_current_user_id\(\)/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE memory_item FROM PUBLIC/);
  assert.doesNotMatch(sql, /GRANT\s+/i);
  assert.doesNotMatch(sql, /ON DELETE CASCADE/i);
});
