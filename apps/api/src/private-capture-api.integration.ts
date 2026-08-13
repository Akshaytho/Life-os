import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";
import { createLifeOsPrivateCaptureServer } from "./private-capture-api";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "private_capture_transport_test";
const appRole = "lifeos_private_capture_transport_app";
const appPassword = "lifeos_private_capture_transport_password";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({ connectionString: appUrl.toString(), max: 4, options: `-c search_path=${schema}` });

class TokenVerifier implements SessionVerifier {
  async verify(value: string) {
    if (value === "owner-session") return { userId: "owner-user" };
    if (value === "other-session") return { userId: "other-user" };
    return undefined;
  }
}

const interpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "TENTATIVE",
      confidence: 0.84,
      observations: [
        { id: "certainty", label: "Certainty", value: "Synthetic tentative plan", trustClass: "OBSERVATION" },
      ],
      clarification: "Should this reserve time?",
      proposals: [{
        key: "private-capture-calendar",
        destination: "CALENDAR",
        operation: "CREATE_CALENDAR_PLAN",
        summary: "Prepare a tentative Calendar plan",
        targetTrustClass: "FACT",
        approvalMode: "EXPLICIT_CONFIRMATION",
        state: "NEEDS_CONFIRMATION",
        reason: "Synthetic tentative input",
        payloadJson: {
          title: "Synthetic private plan",
          category: "Friends",
          commitment: "Flexible",
        },
      }],
    };
  },
};

function ids() {
  let value = 0;
  return {
    next(prefix: "capture" | "interpretation" | "proposal") {
      value += 1;
      return `${prefix}-private-capture-${value}`;
    },
  };
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

function request(text: string, session: string, key = "retry-key-00000001"): RequestInit {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${session}`,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify({ rawText: text }),
  };
}

test("private Capture POST remains retry-safe and owner-scoped through PostgreSQL RLS", async () => {
  const telemetry: TechnicalTelemetryEvent[] = [];
  let requestId = 0;
  let operationMs = 1000;
  let captureClock = 0;
  const server = createLifeOsPrivateCaptureServer({
    sessionVerifier: new TokenVerifier(),
    transportClock: { now: () => "2026-08-14T01:20:00.000Z" },
    requestIds: { next: () => `transport-${++requestId}` },
    unitOfWork: new PostgresWriteUnitOfWork(appPool),
    interpreter,
    captureClock: {
      now: () => new Date(Date.parse("2026-08-14T01:20:00.000Z") + ++captureClock * 1000).toISOString(),
    },
    routingIds: ids(),
    runtime: { environment: "ci", releaseSha: "private-capture-integration", platform: "CI" },
    telemetry: { emit(event) { telemetry.push(structuredClone(event)); } },
    operationTimer: {
      nowMs() { operationMs += 5; return operationMs; },
      nowIso() { return "2026-08-14T01:20:02.000Z"; },
    },
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const ownerCreate = await fetch(`${baseUrl}/api/v1/captures`, request("Synthetic owner source", "owner-session"));
    assert.equal(ownerCreate.status, 201);
    const ownerReceipt = await ownerCreate.json() as { captureId: string; interpretationId: string; proposalIds: string[] };

    const ownerReplay = await fetch(`${baseUrl}/api/v1/captures`, request("Synthetic owner source", "owner-session"));
    assert.equal(ownerReplay.status, 200);
    const replayReceipt = await ownerReplay.json() as { status: string; captureId: string; interpretationId: string; proposalIds: string[] };
    assert.equal(replayReceipt.status, "replayed");
    assert.equal(replayReceipt.captureId, ownerReceipt.captureId);
    assert.equal(replayReceipt.interpretationId, ownerReceipt.interpretationId);
    assert.deepEqual(replayReceipt.proposalIds, ownerReceipt.proposalIds);

    const conflict = await fetch(`${baseUrl}/api/v1/captures`, request("Changed owner source", "owner-session"));
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { status: "idempotency_conflict" });

    const otherCreate = await fetch(`${baseUrl}/api/v1/captures`, request("Synthetic other source", "other-session"));
    assert.equal(otherCreate.status, 201);
    const otherReceipt = await otherCreate.json() as { captureId: string };
    assert.notEqual(otherReceipt.captureId, ownerReceipt.captureId);

    const unauthenticated = await fetch(`${baseUrl}/api/v1/captures`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "retry-key-00000002" },
      body: JSON.stringify({ rawText: "Never persisted" }),
    });
    assert.equal(unauthenticated.status, 401);
  } finally {
    server.close();
    await once(server, "close");
  }

  const scopedOwner = await appPool.connect();
  try {
    await scopedOwner.query("BEGIN");
    await scopedOwner.query("SELECT set_config('lifeos.user_id', $1, true)", ["owner-user"]);
    const ownerCaptures = await scopedOwner.query("SELECT raw_text, request_id, received_at FROM capture_record ORDER BY recorded_at");
    const ownerProposals = await scopedOwner.query("SELECT proposal_id FROM routing_proposal");
    assert.equal(ownerCaptures.rowCount, 1);
    assert.equal(ownerCaptures.rows[0].raw_text, "Synthetic owner source");
    assert.match(ownerCaptures.rows[0].request_id, /^web-idem-v1:capture_create:[a-f0-9]{64}$/);
    assert.equal(ownerCaptures.rows[0].request_id.includes("retry-key-00000001"), false);
    assert.equal(new Date(ownerCaptures.rows[0].received_at).toISOString(), "2026-08-14T01:20:00.000Z");
    assert.equal(ownerProposals.rowCount, 1);
    await scopedOwner.query("ROLLBACK");
  } finally {
    scopedOwner.release();
  }

  const scopedOther = await appPool.connect();
  try {
    await scopedOther.query("BEGIN");
    await scopedOther.query("SELECT set_config('lifeos.user_id', $1, true)", ["other-user"]);
    const otherCaptures = await scopedOther.query("SELECT raw_text, request_id FROM capture_record");
    assert.equal(otherCaptures.rowCount, 1);
    assert.equal(otherCaptures.rows[0].raw_text, "Synthetic other source");
    await scopedOther.query("ROLLBACK");
  } finally {
    scopedOther.release();
  }

  const unscopedCaptures = await appPool.query("SELECT capture_id FROM capture_record");
  const unscopedInterpretations = await appPool.query("SELECT interpretation_id FROM routing_interpretation");
  const unscopedProposals = await appPool.query("SELECT proposal_id FROM routing_proposal");
  assert.equal(unscopedCaptures.rowCount, 0);
  assert.equal(unscopedInterpretations.rowCount, 0);
  assert.equal(unscopedProposals.rowCount, 0);

  const canonicalWrites = await ownerPool.query("SELECT count(*)::int AS count FROM calendar_event");
  const domainEvents = await ownerPool.query("SELECT count(*)::int AS count FROM domain_event");
  assert.equal(canonicalWrites.rows[0].count, 0);
  assert.equal(domainEvents.rows[0].count, 0);

  assert.equal(telemetry.length, 4);
  const telemetryJson = JSON.stringify(telemetry);
  assert.equal(telemetryJson.includes("Synthetic owner source"), false);
  assert.equal(telemetryJson.includes("Synthetic other source"), false);
  assert.equal(telemetryJson.includes("owner-session"), false);
  assert.equal(telemetryJson.includes("other-session"), false);
  assert.equal(telemetryJson.includes("owner-user"), false);
  assert.equal(telemetryJson.includes("other-user"), false);
  assert.equal(telemetryJson.includes("retry-key-00000001"), false);

  const outcomes = telemetry.flatMap((event) => event.kind === "OPERATION" ? [event.outcome] : []);
  assert.deepEqual(outcomes, ["SUCCESS", "SUCCESS", "REJECTED", "SUCCESS"]);
});
