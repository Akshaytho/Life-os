import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { PostgresDirectionDecisionReader } from "../../../packages/database/postgres-direction-decision-reader";
import { getDirectionOverview } from "./get-direction-overview";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "direction_read_test";
const appRole = "lifeos_direction_read_test_app";
const appPassword = "lifeos_direction_read_test_password";

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
    "0007_direction_decision.sql",
  ]) {
    await ownerPool.query(await readFile(`packages/database/migrations/${file}`, "utf8"));
  }

  await adminPool.query(
    `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  await adminPool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT SELECT ON ${schema}.direction_decision TO ${appRole}`);
  await adminPool.query(`GRANT EXECUTE ON FUNCTION ${schema}.lifeos_current_user_id() TO ${appRole}`);
});

beforeEach(async () => {
  await ownerPool.query("TRUNCATE TABLE direction_decision CASCADE");

  await ownerPool.query(`
    INSERT INTO direction_decision
      (direction_id, user_id, statement, status, decided_at, recorded_at, ended_at,
       supersedes_direction_id, request_id, request_fingerprint)
    VALUES
      ('direction-a-old', 'user-a', 'Learn the craft steadily before chasing reach.', 'SUPERSEDED',
       '2026-08-14T08:00:00Z', '2026-08-14T08:00:01Z', '2026-08-16T08:00:01Z',
       NULL, 'direction-a-old-request', repeat('a', 64)),
      ('direction-b-current', 'user-b', 'Keep another user private.', 'ACTIVE',
       '2026-08-15T08:00:00Z', '2026-08-15T08:00:01Z', NULL,
       NULL, 'direction-b-current-request', repeat('b', 64))
  `);

  await ownerPool.query(`
    INSERT INTO direction_decision
      (direction_id, user_id, statement, status, decided_at, recorded_at, ended_at,
       supersedes_direction_id, request_id, request_fingerprint)
    VALUES
      ('direction-a-current', 'user-a', 'Make films with curiosity.\nKeep real-life responsibilities visible.', 'ACTIVE',
       '2026-08-16T08:00:00Z', '2026-08-16T08:00:01Z', NULL,
       'direction-a-old', 'direction-a-current-request', repeat('c', 64))
  `);
});

after(async () => {
  await appPool.end();
  await ownerPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.end();
});

test("SELECT-only RLS reader returns current Direction plus history for only the authenticated user", async () => {
  const reader = new PostgresDirectionDecisionReader(appPool);
  const overview = await getDirectionOverview(
    { principal: { actorType: "USER", userId: "user-a" } },
    { reader },
  );

  assert.deepEqual(overview, {
    current: {
      id: "direction-a-current",
      statement: "Make films with curiosity.\nKeep real-life responsibilities visible.",
      status: "ACTIVE",
      authorityClass: "DECISION",
      decidedAt: "2026-08-16T08:00:00.000Z",
    },
    history: [
      {
        id: "direction-a-old",
        statement: "Learn the craft steadily before chasing reach.",
        status: "SUPERSEDED",
        authorityClass: "DECISION",
        decidedAt: "2026-08-14T08:00:00.000Z",
        endedAt: "2026-08-16T08:00:01.000Z",
      },
    ],
  });
  assert.equal(JSON.stringify(overview).includes("direction-b-current"), false);
  assert.equal(JSON.stringify(overview).includes("request"), false);
  assert.equal(JSON.stringify(overview).includes("fingerprint"), false);
});

test("the same reader returns a different private Direction for another authenticated user", async () => {
  const reader = new PostgresDirectionDecisionReader(appPool);
  const overview = await getDirectionOverview(
    { principal: { actorType: "USER", userId: "user-b" } },
    { reader },
  );

  assert.equal(overview.current?.id, "direction-b-current");
  assert.equal(overview.current?.statement, "Keep another user private.");
  assert.deepEqual(overview.history, []);
  assert.equal(JSON.stringify(overview).includes("direction-a-current"), false);
});

test("without authenticated scope the SELECT-only role sees zero Direction rows", async () => {
  const result = await appPool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM direction_decision",
  );
  assert.equal(result.rows[0]?.count, 0);
});

test("Direction read credential cannot insert or update canonical Direction", async () => {
  await assert.rejects(
    () => appPool.query(`
      INSERT INTO direction_decision
        (direction_id, user_id, statement, status, decided_at, recorded_at,
         request_id, request_fingerprint)
      VALUES ('direction-forbidden', 'user-a', 'Forbidden write', 'ACTIVE', now(), now(),
              'direction-forbidden-request', repeat('f', 64))
    `),
    /permission denied/i,
  );

  await assert.rejects(
    () => appPool.query(
      "UPDATE direction_decision SET statement = 'Forbidden update' WHERE direction_id = 'direction-a-current'",
    ),
    /permission denied/i,
  );
});
