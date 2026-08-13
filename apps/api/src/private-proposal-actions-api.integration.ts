import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { IdGenerator } from "../../../packages/domain/write-boundary";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";
import { captureAndPropose } from "./capture-and-propose";
import { createLifeOsPrivateProposalActionsServer } from "./private-proposal-actions-api";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "private_proposal_actions_test";
const appRole = "lifeos_private_proposal_actions_app";
const appPassword = "lifeos_private_proposal_actions_password";

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

class ApplyIds implements IdGenerator {
  private calendar = 0;
  private event = 0;
  next(prefix: "calendar" | "event") {
    if (prefix === "calendar") return `calendar-private-action-${++this.calendar}`;
    return `event-private-action-${++this.event}`;
  }
}

const interpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "CONFIRMED",
      confidence: 0.9,
      observations: [
        { id: "intent", label: "Intent", value: "Synthetic proposal action test", trustClass: "OBSERVATION" },
      ],
      proposals: [
        {
          key: "apply-calendar",
          destination: "CALENDAR",
          operation: "CREATE_CALENDAR_PLAN",
          summary: "Create reviewed gym plan",
          targetTrustClass: "FACT",
          approvalMode: "REVIEW_AND_APPLY",
          state: "READY_TO_APPLY",
          reason: "Synthetic explicit plan",
          payloadJson: {
            title: "Synthetic gym",
            startsAt: "2026-08-15T13:00:00.000Z",
            endsAt: "2026-08-15T14:00:00.000Z",
            category: "Health",
            commitment: "Important",
          },
        },
        {
          key: "reject-calendar",
          destination: "CALENDAR",
          operation: "CREATE_CALENDAR_PLAN",
          summary: "Tentative social plan",
          targetTrustClass: "FACT",
          approvalMode: "EXPLICIT_CONFIRMATION",
          state: "NEEDS_CONFIRMATION",
          reason: "Synthetic tentative plan",
          payloadJson: {
            title: "Synthetic tentative plan",
            category: "Friends",
            commitment: "Flexible",
          },
        },
      ],
    };
  },
};

function routingIds() {
  let value = 0;
  return {
    next(prefix: "capture" | "interpretation" | "proposal") {
      value += 1;
      return `${prefix}-private-action-${value}`;
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

function actionRequest(body: unknown, session = "owner-session"): RequestInit {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${session}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

test("Apply and Reject HTTP decisions preserve one terminal outcome each under PostgreSQL RLS", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  const seeded = await captureAndPropose(
    { rawText: "Synthetic owner proposal source" },
    {
      principal: { actorType: "USER", userId: "owner-user" },
      source: "WEB_APP",
      receivedAt: "2026-08-14T01:40:00.000Z",
      requestId: "seed-private-proposal-actions",
    },
    {
      unitOfWork,
      interpreter,
      clock: { now: () => "2026-08-14T01:40:01.000Z" },
      ids: routingIds(),
    },
  );
  const [applyProposalId, rejectProposalId] = seeded.proposalIds;

  const telemetry: TechnicalTelemetryEvent[] = [];
  let requestId = 0;
  let operationMs = 1000;
  const server = createLifeOsPrivateProposalActionsServer({
    sessionVerifier: new TokenVerifier(),
    transportClock: { now: () => "2026-08-14T01:45:00.000Z" },
    requestIds: { next: () => `http-action-${++requestId}` },
    unitOfWork,
    mutationClock: { now: () => "2026-08-14T01:45:01.000Z" },
    applyIds: new ApplyIds(),
    runtime: { environment: "ci", releaseSha: "private-proposal-actions", platform: "CI" },
    telemetry: { emit(event) { telemetry.push(structuredClone(event)); } },
    operationTimer: {
      nowMs() { operationMs += 5; return operationMs; },
      nowIso() { return "2026-08-14T01:45:02.000Z"; },
    },
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const apply = await fetch(
      `${baseUrl}/api/v1/proposals/${applyProposalId}/apply`,
      actionRequest({ confirmation: { explicit: true } }),
    );
    assert.equal(apply.status, 200);
    const applyBody = await apply.json() as { status: string; entityId: string; eventId: string };
    assert.equal(applyBody.status, "applied");

    const applyReplay = await fetch(
      `${baseUrl}/api/v1/proposals/${applyProposalId}/apply`,
      actionRequest({ confirmation: { explicit: true } }),
    );
    assert.equal(applyReplay.status, 200);
    const applyReplayBody = await applyReplay.json() as { status: string; entityId: string; eventId: string };
    assert.equal(applyReplayBody.status, "replayed");
    assert.equal(applyReplayBody.entityId, applyBody.entityId);
    assert.equal(applyReplayBody.eventId, applyBody.eventId);

    const reject = await fetch(
      `${baseUrl}/api/v1/proposals/${rejectProposalId}/reject`,
      actionRequest({ reason: "Synthetic decline" }),
    );
    assert.equal(reject.status, 200);
    const rejectText = await reject.text();
    assert.equal(rejectText.includes("Synthetic decline"), false);
    assert.equal((JSON.parse(rejectText) as { status: string }).status, "rejected");

    const rejectReplay = await fetch(
      `${baseUrl}/api/v1/proposals/${rejectProposalId}/reject`,
      actionRequest({ reason: "Synthetic decline" }),
    );
    assert.equal(rejectReplay.status, 200);
    assert.equal((await rejectReplay.json() as { status: string }).status, "replayed");

    const rejectConflict = await fetch(
      `${baseUrl}/api/v1/proposals/${rejectProposalId}/reject`,
      actionRequest({ reason: "Different feedback" }),
    );
    assert.equal(rejectConflict.status, 409);
    assert.deepEqual(await rejectConflict.json(), { status: "rejection_conflict" });

    const crossUser = await fetch(
      `${baseUrl}/api/v1/proposals/${applyProposalId}/apply`,
      actionRequest({ confirmation: { explicit: true } }, "other-session"),
    );
    const missing = await fetch(
      `${baseUrl}/api/v1/proposals/proposal-missing/apply`,
      actionRequest({ confirmation: { explicit: true } }, "other-session"),
    );
    assert.equal(crossUser.status, 404);
    assert.equal(missing.status, 404);
    assert.equal(await crossUser.text(), await missing.text());
  } finally {
    server.close();
    await once(server, "close");
  }

  const owner = await appPool.connect();
  try {
    await owner.query("BEGIN");
    await owner.query("SELECT set_config('lifeos.user_id', $1, true)", ["owner-user"]);
    const calendar = await owner.query("SELECT id, source_proposal_id FROM calendar_event");
    const events = await owner.query("SELECT event_id, event_type, entity_id FROM domain_event");
    const applied = await owner.query("SELECT proposal_id, entity_id, event_id FROM applied_proposal");
    const rejections = await owner.query("SELECT proposal_id, reason FROM proposal_rejection");
    const states = await owner.query("SELECT proposal_id, state FROM routing_proposal ORDER BY proposal_id");

    assert.equal(calendar.rowCount, 1);
    assert.equal(events.rowCount, 1);
    assert.equal(events.rows[0].event_type, "CALENDAR_EVENT_CREATED");
    assert.equal(applied.rowCount, 1);
    assert.equal(rejections.rowCount, 1);
    assert.equal(rejections.rows[0].reason, "Synthetic decline");
    assert.deepEqual(
      states.rows.map((row) => [row.proposal_id, row.state]),
      [[applyProposalId, "APPLIED"], [rejectProposalId, "REJECTED"]].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
    await owner.query("ROLLBACK");
  } finally {
    owner.release();
  }

  const unscopedCalendar = await appPool.query("SELECT id FROM calendar_event");
  const unscopedEvents = await appPool.query("SELECT event_id FROM domain_event");
  const unscopedRejections = await appPool.query("SELECT proposal_id FROM proposal_rejection");
  const unscopedProposals = await appPool.query("SELECT proposal_id FROM routing_proposal");
  assert.equal(unscopedCalendar.rowCount, 0);
  assert.equal(unscopedEvents.rowCount, 0);
  assert.equal(unscopedRejections.rowCount, 0);
  assert.equal(unscopedProposals.rowCount, 0);

  const telemetryJson = JSON.stringify(telemetry);
  assert.equal(telemetryJson.includes("Synthetic owner proposal source"), false);
  assert.equal(telemetryJson.includes("Synthetic decline"), false);
  assert.equal(telemetryJson.includes("Different feedback"), false);
  assert.equal(telemetryJson.includes("owner-session"), false);
  assert.equal(telemetryJson.includes("other-session"), false);
  assert.equal(telemetryJson.includes("owner-user"), false);
  assert.equal(telemetryJson.includes("other-user"), false);

  const outcomes = telemetry.flatMap((event) => event.kind === "OPERATION" ? [event.outcome] : []);
  assert.deepEqual(outcomes, ["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "REJECTED", "UNAVAILABLE", "UNAVAILABLE"]);
});
