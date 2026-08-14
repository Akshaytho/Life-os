import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import { createPrivateDatabaseReadinessProbe } from "./api-runtime";
import { createLifeOsApiServer } from "./api-server";
import { createPrivateApiRuntimeDependencies } from "./private-api-runtime";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "private_runtime_composition_test";
const appRole = "lifeos_private_runtime_app";
const appPassword = "lifeos_private_runtime_password";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({ connectionString: appUrl.toString(), max: 4, options: `-c search_path=${schema}` });
const telemetry: TechnicalTelemetryEvent[] = [];

class SyntheticSessionVerifier implements SessionVerifier {
  async verify(credential: string) {
    return credential === "runtime-owner-session" ? { userId: "runtime-owner" } : undefined;
  }
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
    "0005_proposal_rejection_provenance.sql",
    "0006_safe_fallback_interpreter.sql",
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
  telemetry.length = 0;
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

test("composed runtime proves strict readiness then serves authenticated Safe Fallback Capture without canonical mutation", async () => {
  const readiness = createPrivateDatabaseReadinessProbe(appPool);
  assert.equal(await readiness.check(), true);

  const runtime = {
    environment: "ci" as const,
    releaseSha: "private-runtime-integration",
    platform: "CI" as const,
  };
  let uuid = 0;
  let monotonic = 1000;
  const privateApi = createPrivateApiRuntimeDependencies(
    appPool,
    {},
    runtime,
    { emit: (event) => { telemetry.push(structuredClone(event)); } },
    {
      sessionVerifier: new SyntheticSessionVerifier(),
      randomUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
      now: () => new Date("2026-08-14T11:00:00.000Z"),
      monotonicNowMs: () => ++monotonic,
    },
  );

  const server = createLifeOsApiServer({
    health: { provenance: runtime, readiness },
    privateApi,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const rawText = "Synthetic runtime fallback source must remain private";
  const idempotencyKey = "runtime-fallback-key-000001";
  let captureId = "";
  let proposalId = "";

  try {
    const live = await fetch(`${baseUrl}/health/live`);
    const ready = await fetch(`${baseUrl}/health/ready`);
    assert.equal(live.status, 200);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ready" });

    const created = await fetch(`${baseUrl}/api/v1/captures`, {
      method: "POST",
      headers: {
        authorization: "Bearer runtime-owner-session",
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ rawText }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { captureId: string; proposalIds: string[]; proposalStates: string[] };
    captureId = createdBody.captureId;
    proposalId = createdBody.proposalIds[0];
    assert.deepEqual(createdBody.proposalStates, ["PROPOSED"]);

    const review = await fetch(`${baseUrl}/api/v1/captures/${captureId}/review`, {
      headers: { authorization: "Bearer runtime-owner-session" },
    });
    assert.equal(review.status, 200);
    const reviewBody = await review.json() as {
      source: { rawText: string };
      interpretation: { interpreter: string; intent: string; confidence: number };
      proposals: Array<{ proposalId: string; destination: string; operation: string; state: string }>;
    };
    assert.equal(reviewBody.source.rawText, rawText);
    assert.equal(reviewBody.interpretation.interpreter, "SAFE_FALLBACK");
    assert.equal(reviewBody.interpretation.intent, "RAW_THOUGHT");
    assert.equal(reviewBody.interpretation.confidence, 0);
    assert.equal(reviewBody.proposals[0].proposalId, proposalId);
    assert.equal(reviewBody.proposals[0].destination, "BRAIN_DUMP");
    assert.equal(reviewBody.proposals[0].operation, "KEEP_RAW_CAPTURE");
    assert.equal(reviewBody.proposals[0].state, "PROPOSED");
  } finally {
    server.close();
    await once(server, "close");
  }

  const scoped = await appPool.connect();
  try {
    await scoped.query("BEGIN");
    await scoped.query("SELECT set_config('lifeos.user_id', $1, true)", ["runtime-owner"]);
    const captures = await scoped.query("SELECT capture_id, raw_text FROM capture_record");
    const proposals = await scoped.query("SELECT proposal_id, destination, operation, state FROM routing_proposal");
    const calendar = await scoped.query("SELECT id FROM calendar_event");
    const events = await scoped.query("SELECT event_id FROM domain_event");
    const applied = await scoped.query("SELECT proposal_id FROM applied_proposal");

    assert.equal(captures.rowCount, 1);
    assert.equal(captures.rows[0].capture_id, captureId);
    assert.equal(captures.rows[0].raw_text, rawText);
    assert.equal(proposals.rowCount, 1);
    assert.equal(proposals.rows[0].proposal_id, proposalId);
    assert.equal(proposals.rows[0].destination, "BRAIN_DUMP");
    assert.equal(proposals.rows[0].operation, "KEEP_RAW_CAPTURE");
    assert.equal(proposals.rows[0].state, "PROPOSED");
    assert.equal(calendar.rowCount, 0);
    assert.equal(events.rowCount, 0);
    assert.equal(applied.rowCount, 0);
    await scoped.query("ROLLBACK");
  } finally {
    scoped.release();
  }

  const unscoped = await appPool.query("SELECT count(*)::int AS count FROM capture_record");
  assert.equal(unscoped.rows[0].count, 0);

  const telemetryText = JSON.stringify(telemetry);
  for (const forbidden of [rawText, idempotencyKey, "runtime-owner-session", "runtime-owner"]) {
    assert.equal(telemetryText.includes(forbidden), false, `technical telemetry leaked ${forbidden}`);
  }
});
