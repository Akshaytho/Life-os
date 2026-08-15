import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { PostgresCanonicalCalendarReader } from "../../../packages/database/postgres-canonical-calendar-reader";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "canonical_calendar_read_test";
const appRole = "lifeos_calendar_read_test_app";
const appPassword = "lifeos_calendar_read_test_password";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({ connectionString: appUrl.toString(), max: 2, options: `-c search_path=${schema}` });

before(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);

  for (const file of [
    "0001_write_boundary.sql",
    "0002_capture_routing_proposal.sql",
    "0003_proposal_creation_provenance.sql",
    "0004_row_level_authorization.sql",
    "0005_proposal_rejection_provenance.sql",
    "0006_safe_fallback_interpreter.sql",
  ]) {
    await ownerPool.query(await readFile(`packages/database/migrations/${file}`, "utf8"));
  }

  await adminPool.query(
    `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  await adminPool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT SELECT ON ${schema}.calendar_event TO ${appRole}`);
  await adminPool.query(`GRANT EXECUTE ON FUNCTION ${schema}.lifeos_current_user_id() TO ${appRole}`);
});

beforeEach(async () => {
  await ownerPool.query("TRUNCATE TABLE calendar_event CASCADE");
  await ownerPool.query(`
    INSERT INTO calendar_event
      (id, user_id, title, starts_at, ends_at, category, commitment, created_at, source_proposal_id)
    VALUES
      ('calendar-crossing', 'user-a', 'Overnight focus', '2026-08-15T23:30:00Z', '2026-08-16T01:00:00Z',
       'Work', 'Important', '2026-08-15T20:00:00Z', 'proposal-crossing'),
      ('calendar-inside', 'user-a', 'Gym', '2026-08-16T11:30:00Z', '2026-08-16T12:30:00Z',
       'Health', 'Important', '2026-08-15T20:01:00Z', 'proposal-inside'),
      ('calendar-outside', 'user-a', 'Later trip', '2026-08-20T08:00:00Z', '2026-08-20T09:00:00Z',
       'Travel', 'Flexible', '2026-08-15T20:02:00Z', 'proposal-outside'),
      ('calendar-other-user', 'user-b', 'Private other plan', '2026-08-16T10:00:00Z', '2026-08-16T11:00:00Z',
       'Personal', 'Fixed', '2026-08-15T20:03:00Z', 'proposal-other-user')
  `);
});

after(async () => {
  await appPool.end();
  await ownerPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.end();
});

test("least-privileged Calendar reader returns only overlapping rows owned by the authenticated user", async () => {
  const reader = new PostgresCanonicalCalendarReader(appPool);
  const rows = await reader.listOverlapping(
    "user-a",
    "2026-08-16T00:00:00.000Z",
    "2026-08-17T00:00:00.000Z",
  );

  assert.deepEqual(rows.map((row) => row.id), ["calendar-crossing", "calendar-inside"]);
  assert.equal(rows.every((row) => row.userId === "user-a"), true);
  assert.equal(rows.some((row) => row.title === "Private other plan"), false);
});

test("same SQL reader scope returns a different private Calendar for another authenticated user", async () => {
  const reader = new PostgresCanonicalCalendarReader(appPool);
  const rows = await reader.listOverlapping(
    "user-b",
    "2026-08-16T00:00:00.000Z",
    "2026-08-17T00:00:00.000Z",
  );

  assert.deepEqual(rows.map((row) => row.id), ["calendar-other-user"]);
  assert.equal(rows[0]?.userId, "user-b");
});

test("Calendar read credential has no direct write authority", async () => {
  await assert.rejects(
    () => appPool.query(
      `INSERT INTO calendar_event
        (id, user_id, title, starts_at, ends_at, category, commitment, created_at, source_proposal_id)
       VALUES ('forbidden-write', 'user-a', 'Forbidden', now(), now() + interval '1 hour',
               'Personal', 'Optional', now(), 'forbidden-proposal')`,
    ),
    /permission denied/i,
  );
});
