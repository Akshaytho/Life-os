import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { captureAndPropose, CaptureProposalPersistenceError } from "./capture-and-propose";
import { withWebWriteIdempotency } from "./web-write-idempotency";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "web_write_idempotency_test";
const appRole = "lifeos_web_write_idempotency_app";
const appPassword = "lifeos_web_write_idempotency_password";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({ connectionString: appUrl.toString(), max: 4, options: `-c search_path=${schema}` });

function context(userId: string, requestId: string, receivedAt: string): WriteRequestContext {
  return { principal: { actorType: "USER", userId }, source: "WEB_APP", receivedAt, requestId };
}

function ids(label: string) {
  let value = 0;
  return { next(prefix: string) { value += 1; return `${prefix}-${label}-${value}`; } };
}

const interpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "RAW_THOUGHT",
      certainty: "UNSPECIFIED",
      confidence: 0.74,
      observations: [{ id: "raw", label: "Type", value: "Synthetic raw thought", trustClass: "OBSERVATION" }],
      proposals: [{
        key: "keep-raw",
        destination: "BRAIN_DUMP",
        operation: "KEEP_RAW_CAPTURE",
        summary: "Keep synthetic thought available",
        targetTrustClass: "REFLECTION",
        approvalMode: "REVIEW_AND_APPLY",
        state: "PROPOSED",
        reason: "Synthetic PostgreSQL idempotency fixture",
        payloadJson: {},
      }],
    };
  },
};

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
  ]) {
    const migration = await readFile(`packages/database/migrations/${file}`, "utf8");
    await ownerPool.query(migration);
  }

  await adminPool.query(
    `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  await adminPool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT EXECUTE ON FUNCTION ${schema}.lifeos_current_user_id() TO ${appRole}`);
});

beforeEach(async () => {
  await ownerPool.query(`
    TRUNCATE TABLE proposal_rejection, routing_proposal, routing_interpretation, capture_record,
      applied_proposal, domain_event, calendar_event CASCADE
  `);
});

after(async () => {
  await appPool.end();
  await ownerPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.end();
});

test("same authenticated user/key/body replays one persisted Capture bundle", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  let tick = 0;
  let interpretationCalls = 0;
  const countedInterpreter: CaptureInterpreter = {
    async interpret(input) {
      interpretationCalls += 1;
      return interpreter.interpret(input);
    },
  };
  const clock = { now: () => new Date(Date.parse("2026-08-13T07:30:00.000Z") + ++tick * 1000).toISOString() };
  const idGenerator = ids("owner");

  const firstContext = withWebWriteIdempotency(
    context("owner-user", "server-a", "2026-08-13T07:30:00.000Z"),
    "CAPTURE_CREATE",
    "capture-http-retry-0001",
  );
  const first = await captureAndPropose(
    { rawText: "Synthetic PostgreSQL retry-safe thought" },
    firstContext,
    { unitOfWork, interpreter: countedInterpreter, clock, ids: idGenerator },
  );

  const retryContext = withWebWriteIdempotency(
    context("owner-user", "server-b", "2026-08-13T07:35:00.000Z"),
    "CAPTURE_CREATE",
    "capture-http-retry-0001",
  );
  const replay = await captureAndPropose(
    { rawText: "Synthetic PostgreSQL retry-safe thought" },
    retryContext,
    { unitOfWork, interpreter: countedInterpreter, clock, ids: idGenerator },
  );

  assert.equal(first.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.captureId, first.captureId);
  assert.deepEqual(replay.proposalIds, first.proposalIds);
  assert.equal(interpretationCalls, 1);

  const counts = await ownerPool.query<{
    captures: string;
    interpretations: string;
    proposals: string;
  }>(`
    SELECT
      (SELECT count(*) FROM capture_record)::text AS captures,
      (SELECT count(*) FROM routing_interpretation)::text AS interpretations,
      (SELECT count(*) FROM routing_proposal)::text AS proposals
  `);
  assert.deepEqual(counts.rows[0], { captures: "1", interpretations: "1", proposals: "1" });

  const stored = await ownerPool.query<{ request_id: string; raw_text: string; received_at: Date }>(
    "SELECT request_id, raw_text, received_at FROM capture_record WHERE capture_id = $1",
    [first.captureId],
  );
  assert.equal(stored.rows[0]?.request_id, firstContext.requestId);
  assert.equal(stored.rows[0]?.request_id.includes("capture-http-retry-0001"), false);
  assert.equal(stored.rows[0]?.raw_text, "Synthetic PostgreSQL retry-safe thought");
  assert.equal(stored.rows[0]?.received_at.toISOString(), "2026-08-13T07:30:00.000Z");

  const unscoped = await appPool.query("SELECT capture_id FROM capture_record");
  assert.equal(unscoped.rowCount, 0);
});

test("same user/key cannot be rebound to different Capture content", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  let tick = 0;
  const clock = { now: () => new Date(Date.parse("2026-08-13T07:40:00.000Z") + ++tick * 1000).toISOString() };
  const idGenerator = ids("content");
  const firstContext = withWebWriteIdempotency(context("owner-user", "a", "2026-08-13T07:40:00.000Z"), "CAPTURE_CREATE", "capture-http-retry-0002");
  await captureAndPropose({ rawText: "Original synthetic content" }, firstContext, { unitOfWork, interpreter, clock, ids: idGenerator });

  const retryContext = withWebWriteIdempotency(context("owner-user", "b", "2026-08-13T07:41:00.000Z"), "CAPTURE_CREATE", "capture-http-retry-0002");
  await assert.rejects(
    () => captureAndPropose({ rawText: "Different synthetic content" }, retryContext, { unitOfWork, interpreter, clock, ids: idGenerator }),
    (error: unknown) => error instanceof CaptureProposalPersistenceError && /different Capture content/.test(error.message),
  );

  const count = await ownerPool.query<{ count: string }>("SELECT count(*)::text AS count FROM capture_record");
  assert.equal(count.rows[0]?.count, "1");
});

test("same raw retry token remains isolated across authenticated users", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  let tick = 0;
  const clock = { now: () => new Date(Date.parse("2026-08-13T07:50:00.000Z") + ++tick * 1000).toISOString() };
  const sharedKey = "capture-http-retry-shared";

  const userAContext = withWebWriteIdempotency(context("user-a", "a", "2026-08-13T07:50:00.000Z"), "CAPTURE_CREATE", sharedKey);
  const userBContext = withWebWriteIdempotency(context("user-b", "b", "2026-08-13T07:50:00.000Z"), "CAPTURE_CREATE", sharedKey);
  assert.notEqual(userAContext.requestId, userBContext.requestId);

  const first = await captureAndPropose({ rawText: "Synthetic user A thought" }, userAContext, { unitOfWork, interpreter, clock, ids: ids("a") });
  const second = await captureAndPropose({ rawText: "Synthetic user B thought" }, userBContext, { unitOfWork, interpreter, clock, ids: ids("b") });
  assert.notEqual(first.captureId, second.captureId);

  const owners = await ownerPool.query<{ user_id: string; count: string }>(
    "SELECT user_id, count(*)::text AS count FROM capture_record GROUP BY user_id ORDER BY user_id",
  );
  assert.deepEqual(owners.rows, [
    { user_id: "user-a", count: "1" },
    { user_id: "user-b", count: "1" },
  ]);
});
