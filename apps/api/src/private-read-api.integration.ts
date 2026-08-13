import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { captureAndPropose } from "./capture-and-propose";
import { createLifeOsPrivateReadServer } from "./private-read-api";
import { PostgresInteractionChangeLedgerReader } from "../../../packages/database/postgres-interaction-change-ledger-reader";
import { PostgresProposalReviewReader } from "../../../packages/database/postgres-proposal-review-reader";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "private_read_transport_test";
const appRole = "lifeos_private_read_transport_app";
const appPassword = "lifeos_private_read_transport_password";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({ connectionString: appUrl.toString(), max: 4, options: `-c search_path=${schema}` });

const interpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "TENTATIVE",
      confidence: 0.83,
      observations: [
        { id: "certainty", label: "Certainty", value: "Synthetic tentative plan", trustClass: "OBSERVATION" },
      ],
      clarification: "Should this reserve time?",
      proposals: [{
        key: "private-read-calendar",
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

function context(userId: string): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt: "2026-08-13T06:20:00.000Z",
    requestId: `seed-${userId}`,
  };
}

function ids() {
  let value = 0;
  return {
    next(prefix: string) {
      value += 1;
      return `${prefix}-private-read-${value}`;
    },
  };
}

class TokenVerifier implements SessionVerifier {
  async verify(credential: string) {
    if (credential === "owner-token") return { userId: "owner-user" };
    if (credential === "other-token") return { userId: "other-user" };
    return undefined;
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

test("private HTTP reads derive user from verified session and remain RLS-isolated", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  let tick = 0;
  const clock = { now: () => new Date(Date.parse("2026-08-13T06:20:00.000Z") + ++tick * 1000).toISOString() };

  const capture = await captureAndPropose(
    { rawText: "Synthetic owner-only source" },
    context("owner-user"),
    { unitOfWork, interpreter, clock, ids: ids() },
  );

  const telemetry: TechnicalTelemetryEvent[] = [];
  let requestId = 0;
  let operationMs = 1000;
  const server = createLifeOsPrivateReadServer({
    sessionVerifier: new TokenVerifier(),
    transportClock: { now: () => "2026-08-13T06:25:00.000Z" },
    requestIds: { next: () => `http-request-${++requestId}` },
    proposalReviewReader: new PostgresProposalReviewReader(appPool),
    interactionLedgerReader: new PostgresInteractionChangeLedgerReader(appPool),
    runtime: { environment: "ci", releaseSha: "private-read-integration", platform: "CI" },
    telemetry: { emit(event) { telemetry.push(structuredClone(event)); } },
    operationTimer: {
      nowMs() { operationMs += 5; return operationMs; },
      nowIso() { return "2026-08-13T06:25:01.000Z"; },
    },
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const ownerReview = await fetch(`${baseUrl}/api/v1/captures/${capture.captureId}/review`, {
      headers: { authorization: "Bearer owner-token" },
    });
    assert.equal(ownerReview.status, 200);
    const ownerReviewBody = await ownerReview.text();
    assert.equal(ownerReviewBody.includes("Synthetic owner-only source"), true);
    assert.equal(ownerReviewBody.includes("owner-token"), false);

    const otherReview = await fetch(`${baseUrl}/api/v1/captures/${capture.captureId}/review`, {
      headers: { authorization: "Bearer other-token" },
    });
    const missingReview = await fetch(`${baseUrl}/api/v1/captures/capture-missing/review`, {
      headers: { authorization: "Bearer other-token" },
    });
    assert.equal(otherReview.status, 404);
    assert.equal(missingReview.status, 404);
    assert.equal(await otherReview.text(), await missingReview.text());

    const ownerTrace = await fetch(`${baseUrl}/api/v1/interactions/${capture.captureId}/trace`, {
      headers: { authorization: "Bearer owner-token" },
    });
    assert.equal(ownerTrace.status, 200);
    const ownerTraceBody = await ownerTrace.text();
    assert.equal(ownerTraceBody.includes("Synthetic owner-only source"), true);
    assert.equal(ownerTraceBody.includes("seed-owner-user"), false);

    const otherTrace = await fetch(`${baseUrl}/api/v1/interactions/${capture.captureId}/trace`, {
      headers: { authorization: "Bearer other-token" },
    });
    assert.equal(otherTrace.status, 404);
    assert.deepEqual(await otherTrace.json(), { status: "not_found" });

    const unauthenticated = await fetch(`${baseUrl}/api/v1/captures/${capture.captureId}/review`);
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(await unauthenticated.json(), { status: "authentication_required" });
  } finally {
    server.close();
    await once(server, "close");
  }

  const unscopedCaptures = await appPool.query("SELECT capture_id FROM capture_record");
  const unscopedProposals = await appPool.query("SELECT proposal_id FROM routing_proposal");
  assert.equal(unscopedCaptures.rowCount, 0);
  assert.equal(unscopedProposals.rowCount, 0);

  assert.equal(telemetry.length, 5);
  const telemetryJson = JSON.stringify(telemetry);
  assert.equal(telemetryJson.includes("Synthetic owner-only source"), false);
  assert.equal(telemetryJson.includes("owner-token"), false);
  assert.equal(telemetryJson.includes("other-token"), false);
  assert.equal(telemetryJson.includes("owner-user"), false);
  assert.equal(telemetryJson.includes("other-user"), false);

  const outcomes = telemetry.flatMap((event) => event.kind === "OPERATION" ? [event.outcome] : []);
  assert.deepEqual(outcomes, ["SUCCESS", "UNAVAILABLE", "UNAVAILABLE", "SUCCESS", "UNAVAILABLE"]);
});
