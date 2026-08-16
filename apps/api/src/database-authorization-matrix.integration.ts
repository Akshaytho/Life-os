import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { PostgresUserScope } from "../../../packages/database/postgres-user-scope";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const runSuffix = String(process.pid);
const schema = `database_authorization_matrix_${runSuffix}`;
const appRole = `lifeos_rls_matrix_app_${runSuffix}`;
const userCount = 100;
const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const pool = new Pool({
  connectionString: databaseUrl,
  max: 8,
  options: `-c search_path=${schema}`,
});
const scope = new PostgresUserScope(pool);

function userId(index: number) {
  return `matrix-user-${String(index).padStart(3, "0")}`;
}

function nextUserId(index: number) {
  return userId(index === userCount ? 1 : index + 1);
}

async function asApplicationRole<T>(boundUserId: string, work: (client: import("pg").PoolClient) => Promise<T>) {
  return scope.run(boundUserId, async (client) => {
    await client.query(`SET LOCAL ROLE ${appRole}`);
    return work(client);
  });
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

  await pool.query(`
    INSERT INTO capture_record
      (capture_id, user_id, raw_text, source, correlation_id, request_id, received_at, recorded_at)
    SELECT
      'capture-' || lpad(g::text, 3, '0'),
      'matrix-user-' || lpad(g::text, 3, '0'),
      'private capture ' || g,
      'WEB_APP',
      'capture-' || lpad(g::text, 3, '0'),
      'request-' || lpad(g::text, 3, '0'),
      '2026-08-17T00:00:00Z'::timestamptz,
      '2026-08-17T00:00:01Z'::timestamptz
    FROM generate_series(1, ${userCount}) AS g;

    INSERT INTO routing_interpretation
      (interpretation_id, capture_id, user_id, version, interpreter, intent, certainty,
       confidence, observations_json, clarification, created_at)
    SELECT
      'interpretation-' || lpad(g::text, 3, '0'),
      'capture-' || lpad(g::text, 3, '0'),
      'matrix-user-' || lpad(g::text, 3, '0'),
      1, 'SAFE_FALLBACK', 'RAW_THOUGHT', 'UNSPECIFIED', 0,
      '[]'::jsonb, NULL, '2026-08-17T00:00:02Z'::timestamptz
    FROM generate_series(1, ${userCount}) AS g;

    INSERT INTO routing_proposal
      (proposal_id, interpreter_proposal_key, user_id, capture_id, interpretation_id,
       destination, operation, summary, target_trust_class, approval_mode, state,
       reason, payload_json, created_at)
    SELECT
      'proposal-' || lpad(g::text, 3, '0'),
      'proposal-key-' || lpad(g::text, 3, '0'),
      'matrix-user-' || lpad(g::text, 3, '0'),
      'capture-' || lpad(g::text, 3, '0'),
      'interpretation-' || lpad(g::text, 3, '0'),
      'BRAIN_DUMP', 'KEEP_RAW_CAPTURE', 'Keep private capture ' || g,
      'SUGGESTION', 'REVIEW_AND_APPLY', 'APPLIED', 'matrix isolation', '{}'::jsonb,
      '2026-08-17T00:00:03Z'::timestamptz
    FROM generate_series(1, ${userCount}) AS g;

    INSERT INTO calendar_event
      (id, user_id, title, starts_at, ends_at, category, commitment, created_at, source_proposal_id)
    SELECT
      'calendar-' || lpad(g::text, 3, '0'),
      'matrix-user-' || lpad(g::text, 3, '0'),
      'private event ' || g,
      '2026-08-17T10:00:00Z'::timestamptz + (g || ' minutes')::interval,
      '2026-08-17T11:00:00Z'::timestamptz + (g || ' minutes')::interval,
      'Personal', 'Flexible', '2026-08-17T00:00:04Z'::timestamptz,
      'proposal-' || lpad(g::text, 3, '0')
    FROM generate_series(1, ${userCount}) AS g;

    INSERT INTO domain_event
      (event_id, user_id, occurred_at, recorded_at, actor_type, actor_id,
       event_type, entity_type, entity_id, source, correlation_id,
       causation_event_id, payload_json, schema_version)
    SELECT
      'event-' || lpad(g::text, 3, '0'),
      'matrix-user-' || lpad(g::text, 3, '0'),
      '2026-08-17T00:00:05Z'::timestamptz,
      '2026-08-17T00:00:05Z'::timestamptz,
      'USER', 'matrix-user-' || lpad(g::text, 3, '0'),
      'CALENDAR_EVENT_CREATED', 'calendar_event', 'calendar-' || lpad(g::text, 3, '0'),
      'WEB_APP', 'capture-' || lpad(g::text, 3, '0'), NULL,
      jsonb_build_object('proposalId', 'proposal-' || lpad(g::text, 3, '0')), 1
    FROM generate_series(1, ${userCount}) AS g;

    INSERT INTO applied_proposal
      (proposal_id, applied_at, confirmed_by_actor_id, request_fingerprint,
       entity_type, entity_id, event_id)
    SELECT
      'proposal-' || lpad(g::text, 3, '0'),
      '2026-08-17T00:00:06Z'::timestamptz,
      'matrix-user-' || lpad(g::text, 3, '0'),
      md5(g::text) || md5('matrix-' || g::text),
      'calendar_event',
      'calendar-' || lpad(g::text, 3, '0'),
      'event-' || lpad(g::text, 3, '0')
    FROM generate_series(1, ${userCount}) AS g;
  `);
});

after(async () => {
  await pool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.end();
});

test("100 authenticated user scopes each see exactly one owned row across every RLS-protected V1 table", async (t) => {
  for (let index = 1; index <= userCount; index += 1) {
    await t.test(`isolated user scope ${index}`, async () => {
      const boundUserId = userId(index);
      const result = await asApplicationRole(boundUserId, async (client) => {
        return client.query<{
          current_user_id: string | null;
          captures: string;
          interpretations: string;
          proposals: string;
          calendar: string;
          events: string;
          applied: string;
          capture_owner: string | null;
          proposal_owner: string | null;
        }>(`
          SELECT
            lifeos_current_user_id() AS current_user_id,
            (SELECT count(*)::text FROM capture_record) AS captures,
            (SELECT count(*)::text FROM routing_interpretation) AS interpretations,
            (SELECT count(*)::text FROM routing_proposal) AS proposals,
            (SELECT count(*)::text FROM calendar_event) AS calendar,
            (SELECT count(*)::text FROM domain_event) AS events,
            (SELECT count(*)::text FROM applied_proposal) AS applied,
            (SELECT user_id FROM capture_record LIMIT 1) AS capture_owner,
            (SELECT user_id FROM routing_proposal LIMIT 1) AS proposal_owner
        `);
      });

      assert.deepEqual(result.rows[0], {
        current_user_id: boundUserId,
        captures: "1",
        interpretations: "1",
        proposals: "1",
        calendar: "1",
        events: "1",
        applied: "1",
        capture_owner: boundUserId,
        proposal_owner: boundUserId,
      });
    });
  }
});

test("100 user scopes cannot update or delete the next user's Capture", async (t) => {
  for (let index = 1; index <= userCount; index += 1) {
    await t.test(`cross-user mutation blocked ${index}`, async () => {
      const targetIndex = index === userCount ? 1 : index + 1;
      const targetCaptureId = `capture-${String(targetIndex).padStart(3, "0")}`;
      const result = await asApplicationRole(userId(index), async (client) => {
        const update = await client.query(
          "UPDATE capture_record SET raw_text = 'forged update' WHERE capture_id = $1",
          [targetCaptureId],
        );
        const deletion = await client.query(
          "DELETE FROM capture_record WHERE capture_id = $1",
          [targetCaptureId],
        );
        return { updated: update.rowCount, deleted: deletion.rowCount };
      });

      assert.deepEqual(result, { updated: 0, deleted: 0 });
      const ownerCheck = await pool.query<{ user_id: string; raw_text: string }>(
        "SELECT user_id, raw_text FROM capture_record WHERE capture_id = $1",
        [targetCaptureId],
      );
      assert.equal(ownerCheck.rows[0].user_id, nextUserId(index));
      assert.notEqual(ownerCheck.rows[0].raw_text, "forged update");
    });
  }
});

test("100 user scopes cannot insert a Capture owned by the next user", async (t) => {
  for (let index = 1; index <= userCount; index += 1) {
    await t.test(`cross-user insert blocked ${index}`, async () => {
      const forgedId = `forged-${String(index).padStart(3, "0")}`;
      await assert.rejects(
        () => asApplicationRole(userId(index), async (client) => {
          await client.query(
            `INSERT INTO capture_record
              (capture_id, user_id, raw_text, source, correlation_id, request_id, received_at, recorded_at)
             VALUES ($1, $2, 'forged insert', 'WEB_APP', $1, $3,
                     '2026-08-17T02:00:00Z', '2026-08-17T02:00:01Z')`,
            [forgedId, nextUserId(index), `forged-request-${index}`],
          );
        }),
        /row-level security policy/,
      );

      const leaked = await pool.query("SELECT capture_id FROM capture_record WHERE capture_id = $1", [forgedId]);
      assert.equal(leaked.rowCount, 0);
    });
  }
});
