import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL("../../../packages/database/migrations/0012_periodic_reviews.sql", import.meta.url);

test("Periodic Reviews schema is versioned, forced-RLS, and non-destructive", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS periodic_review/);
  assert.match(sql, /period_kind IN \('WEEK', 'MONTH'\)/);
  assert.match(sql, /authority_class = 'REFLECTION'/);
  assert.match(sql, /WHERE status = 'CURRENT'/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /lifeos_current_user_id\(\)/);
  assert.match(sql, /REVOKE ALL PRIVILEGES ON TABLE periodic_review FROM PUBLIC/);
  assert.doesNotMatch(sql, /GRANT\s+/i);
  assert.doesNotMatch(sql, /ON DELETE CASCADE/i);
});
