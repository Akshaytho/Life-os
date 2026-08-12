import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { PostgresUserScope, PostgresUserScopeError } from "../../../packages/database/postgres-user-scope";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "database_authorization_test";
const appRole = "lifeos_rls_test_app";
const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const pool = new Pool({
  connectionString: databaseUrl,
  max: 4,
  options: `-c search_path=${schema}`,
});
const scope = new PostgresUserScope(pool);

async function asApplicationRole<T>(userId: string, work: (client: import("pg").PoolClient) => Promise<T>) {
  return scope.run(userId, async (client) => {
    await client.query(`SET LOCAL ROLE ${appRole}`);
    return work(client);
  });
}

async function seedTwoUsers() {
  await pool.query(`
    INSERT INTO capture_record
      (capture_id, user_id, raw_text, source, correlation_id, request_id, received_at, recorded_at)
    VALUES
      ('capture-a', 'user-a', 'A private capture', 'WEB_APP', 'capture-a', 'request-a',
       '2026-08-13T00:00:00Z', '2026-08-13T00:00:01Z'),
      ('capture-b', 'user-b', 'B private capture', 'WEB_APP', 'capture-b', 'request-b',
       '2026-08-13T00:00:00Z', '2026-08-13T00:00:01Z');

    INSERT INTO routing_interpretation
      (interpretation_id, capture_id, user_id, version, interpreter, intent, certainty,
       confidence, observations_json, clarification, created_at)
    VALUES
      ('interpretation-a', 'capture-a', 'user-a', 1, 'LIFE_OS_AI', 'RAW_THOUGHT', 'UNSPECIFIED',
       0.8, '[]'::jsonb, NULL, '2026-08-13T00:00:02Z'),
      ('interpretation-b', 'capture-b', 'user-b', 1, 'LIFE_OS_AI', 'RAW_THOUGHT', 'UNSPECIFIED',
       0.8, '[]'::jsonb, NULL, '2026-08-13T00:00:02Z');

    INSERT INTO routing_proposal
      (proposal_id, interpreter_proposal_key, user_id, capture_id, interpretation_id,
       destination, operation, summary, target_trust_class, approval_mode, state,
       reason, payload_json, created_at)
    VALUES
      ('proposal-a', 'proposal-a-key', 'user-a', 'capture-a', 'interpretation-a',
       'BRAIN_DUMP', 'KEEP_RAW_CAPTURE', 'Keep A capture', 'SUGGESTION',
       'REVIEW_AND_APPLY', 'PROPOSED', 'Test A ownership', '{}'::jsonb, '2026-08-13T00:00:03Z'),
      ('proposal-b', 'proposal-b-key', 'user-b', 'capture-b', 'interpretation-b',
       'BRAIN_DUMP', 'KEEP_RAW_CAPTURE', 'Keep B capture', 'SUGGESTION',
       'REVIEW_AND_APPLY', 'PROPOSED', 'Test B ownership', '{}'::jsonb, '2026-08-13T00:00:03Z');

    INSERT INTO calendar_event
      (id, user_id, title, starts_at, ends_at, category, commitment, created_at, source_proposal_id)
    VALUES
      ('calendar-a', 'user-a', 'A event', '2026-08-14T10:00:00Z', '2026-08-14T11:00:00Z',
       'Personal', 'Flexible', '2026-08-13T00:00:04Z', 'proposal-a'),
      ('calendar-b', 'user-b', 'B event', '2026-08-14T12:00:00Z', '2026-08-14T13:00:00Z',
       'Personal', 'Flexible', '2026-08-13T00:00:04Z', 'proposal-b');

    INSERT INTO domain_event
      (event_id, user_id, occurred_at, recorded_at, actor_type, actor_id,
       event_type, entity_type, entity_id, source, correlation_id,
       causation_event_id, payload_json, schema_version)
    VALUES
      ('event-a', 'user-a', '2026-08-13T00:00:05Z', '2026-08-13T00:00:05Z',
       'USER', 'user-a', 'CALENDAR_EVENT_CREATED', 'calendar_event', 'calendar-a',
       'WEB_APP', 'capture-a', NULL, '{"proposalId":"proposal-a"}'::jsonb, 1),
      ('event-b', 'user-b', '2026-08-13T00:00:05Z', '2026-08-13T00:00:05Z',
       'USER', 'user-b', 'CALENDAR_EVENT_CREATED', 'calendar_event', 'calendar-b',
       'WEB_APP', 'capture-b', NULL, '{"proposalId":"proposal-b"}'::jsonb, 1);

    INSERT INTO applied_proposal
      (proposal_id, applied_at, confirmed_by_actor_id, request_fingerprint,
       entity_type, entity_id, event_id)
    VALUES
      ('proposal-a', '2026-08-13T00:00:06Z', 'user-a', repeat('a', 64),
       'calendar_event', 'calendar-a', 'event-a'),
      ('proposal-b', '2026-08-13T00:00:06Z', 'user-b', repeat('b', 64),
       'calendar_event', 'calendar-b', 'event-b');
  `);
}

before(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);

  for (const file of [
    "0001_write_boundary.sql",
    "0002_capture_routing_proposal.sql",
    "0003_proposal_creation_provenance.sql",
    "0004_row_level_authorization.sql",
  ]) {
    const migration = await readFile(`packages/database/migrations/${file}`, "utf8");
    await pool.query(migration);
  }

  await adminPool.query(`CREATE ROLE ${appRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await adminPool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT EXECUTE ON FUNCTION ${schema}.lifeos_current_user_id() TO ${appRole}`);
});

beforeEach(async () => {
  await pool.query(`
    TRUNCATE TABLE routing_proposal, routing_interpretation, capture_record,
      applied_proposal, domain_event, calendar_event CASCADE
  `);
  await seedTwoUsers();
});

after(async () => {
  await pool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.end();
});

test("application role is explicitly non-superuser and cannot bypass RLS", async () => {
  const result = await adminPool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
    [appRole],
  );
  assert.deepEqual(result.rows[0], { rolsuper: false, rolbypassrls: false });
});

test("without a bound authenticated user, broad private reads fail closed to zero rows", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${appRole}`);

    const current = await client.query<{ user_id: string | null }>(
      `SELECT lifeos_current_user_id() AS user_id`,
    );
    assert.equal(current.rows[0].user_id, null);

    const captures = await client.query("SELECT capture_id FROM capture_record");
    const calendar = await client.query("SELECT id FROM calendar_event");
    const proposals = await client.query("SELECT proposal_id FROM routing_proposal");

    assert.equal(captures.rowCount, 0);
    assert.equal(calendar.rowCount, 0);
    assert.equal(proposals.rowCount, 0);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

test("a user scope filters broad SELECTs across every protected table even without WHERE user_id", async () => {
  const result = await asApplicationRole("user-a", async (client) => {
    return Promise.all([
      client.query<{ capture_id: string }>("SELECT capture_id FROM capture_record"),
      client.query<{ interpretation_id: string }>("SELECT interpretation_id FROM routing_interpretation"),
      client.query<{ proposal_id: string }>("SELECT proposal_id FROM routing_proposal"),
      client.query<{ id: string }>("SELECT id FROM calendar_event"),
      client.query<{ event_id: string }>("SELECT event_id FROM domain_event"),
      client.query<{ proposal_id: string }>("SELECT proposal_id FROM applied_proposal"),
    ]);
  });

  assert.deepEqual(result[0].rows.map((row) => row.capture_id), ["capture-a"]);
  assert.deepEqual(result[1].rows.map((row) => row.interpretation_id), ["interpretation-a"]);
  assert.deepEqual(result[2].rows.map((row) => row.proposal_id), ["proposal-a"]);
  assert.deepEqual(result[3].rows.map((row) => row.id), ["calendar-a"]);
  assert.deepEqual(result[4].rows.map((row) => row.event_id), ["event-a"]);
  assert.deepEqual(result[5].rows.map((row) => row.proposal_id), ["proposal-a"]);
});

test("changing the bound user changes the visible private rows without changing SQL", async () => {
  const readCaptureIds = (userId: string) => asApplicationRole(userId, async (client) => {
    const result = await client.query<{ capture_id: string }>("SELECT capture_id FROM capture_record ORDER BY capture_id");
    return result.rows.map((row) => row.capture_id);
  });

  assert.deepEqual(await readCaptureIds("user-a"), ["capture-a"]);
  assert.deepEqual(await readCaptureIds("user-b"), ["capture-b"]);
});

test("WITH CHECK blocks inserting a row owned by another user", async () => {
  await assert.rejects(
    () => asApplicationRole("user-a", async (client) => {
      await client.query(
        `INSERT INTO capture_record
          (capture_id, user_id, raw_text, source, correlation_id, request_id, received_at, recorded_at)
         VALUES ('capture-forged', 'user-b', 'forged ownership', 'WEB_APP', 'capture-forged',
                 'request-forged', '2026-08-13T01:00:00Z', '2026-08-13T01:00:00Z')`,
      );
    }),
    /row-level security policy/,
  );

  const leaked = await pool.query("SELECT capture_id FROM capture_record WHERE capture_id = 'capture-forged'");
  assert.equal(leaked.rowCount, 0);
});

test("WITH CHECK blocks changing an owned row to another user", async () => {
  await assert.rejects(
    () => asApplicationRole("user-a", async (client) => {
      await client.query("UPDATE capture_record SET user_id = 'user-b' WHERE capture_id = 'capture-a'");
    }),
    /row-level security policy/,
  );

  const owner = await pool.query<{ user_id: string }>("SELECT user_id FROM capture_record WHERE capture_id = 'capture-a'");
  assert.equal(owner.rows[0].user_id, "user-a");
});

test("an unowned DELETE is invisible and removes nothing", async () => {
  const deleted = await asApplicationRole("user-a", async (client) => {
    return client.query("DELETE FROM capture_record WHERE capture_id = 'capture-b'");
  });
  assert.equal(deleted.rowCount, 0);

  const stillThere = await pool.query("SELECT capture_id FROM capture_record WHERE capture_id = 'capture-b'");
  assert.equal(stillThere.rowCount, 1);
});

test("applied proposal visibility requires both confirming actor and real proposal ownership", async () => {
  await pool.query(`
    UPDATE applied_proposal SET confirmed_by_actor_id = 'user-a' WHERE proposal_id = 'proposal-b'
  `);

  const visible = await asApplicationRole("user-a", async (client) => {
    const result = await client.query<{ proposal_id: string }>("SELECT proposal_id FROM applied_proposal ORDER BY proposal_id");
    return result.rows.map((row) => row.proposal_id);
  });

  assert.deepEqual(visible, ["proposal-a"]);
});

test("transaction-local identity scope does not intentionally survive into an unscoped transaction", async () => {
  await asApplicationRole("user-a", async (client) => {
    const current = await client.query<{ user_id: string | null }>("SELECT lifeos_current_user_id() AS user_id");
    assert.equal(current.rows[0].user_id, "user-a");
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${appRole}`);
    const current = await client.query<{ user_id: string | null }>("SELECT lifeos_current_user_id() AS user_id");
    assert.equal(current.rows[0].user_id, null);
    assert.equal((await client.query("SELECT capture_id FROM capture_record")).rowCount, 0);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

test("blank authenticated user IDs are rejected before opening a private database scope", async () => {
  await assert.rejects(
    () => scope.run("   ", async () => undefined),
    (error: unknown) => error instanceof PostgresUserScopeError && /authenticatedUserId/.test(error.message),
  );
});
