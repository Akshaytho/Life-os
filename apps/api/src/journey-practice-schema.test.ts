import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../packages/database/migrations/0011_journey_activation_practice.sql",
  import.meta.url,
);

test("migration 0011 encodes append-only Journey evidence with forced owner RLS", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of [
    "journey_capability_decision",
    "journey_practice_session",
    "journey_practice_completion",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`${table}_user_policy`));
  }
  assert.match(sql, /UNIQUE \(user_id\)/);
  assert.match(sql, /UNIQUE \(practice_session_id, user_id\)/);
  assert.match(sql, /lifeos_enforce_one_open_practice_session/);
  assert.match(sql, /lifeos_validate_practice_completion/);
  assert.match(sql, /NEW\.completed_at < session_started_at/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /reflection_authority_class = 'REFLECTION'/);
  assert.match(sql, /authority_class = 'DECISION'/);
  assert.match(sql, /REVOKE ALL PRIVILEGES[\s\S]*FROM PUBLIC/);
  assert.doesNotMatch(sql, /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)/i);
});
