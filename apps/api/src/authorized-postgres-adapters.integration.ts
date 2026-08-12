import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { applyCalendarPlanProposal, ProposalValidationError } from "./apply-calendar-plan-proposal";
import { captureAndPropose } from "./capture-and-propose";
import { getCaptureProposalReview } from "./get-capture-proposal-review";
import { PostgresProposalReviewReader } from "../../../packages/database/postgres-proposal-review-reader";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "authorized_postgres_adapters_test";
const appRole = "lifeos_authorized_adapter_test_app";
const appPassword = "lifeos_authorized_adapter_test_password";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({
  connectionString: databaseUrl,
  max: 2,
  options: `-c search_path=${schema}`,
});
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({
  connectionString: appUrl.toString(),
  max: 4,
  options: `-c search_path=${schema}`,
});

const interpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "CONFIRMED",
      confidence: 0.97,
      observations: [
        { id: "dated", label: "Timing", value: "Explicit date/time is present", trustClass: "OBSERVATION" },
      ],
      proposals: [
        {
          key: "calendar-gym",
          destination: "CALENDAR",
          operation: "CREATE_CALENDAR_PLAN",
          summary: "Add gym to Calendar",
          targetTrustClass: "FACT",
          approvalMode: "REVIEW_AND_APPLY",
          state: "READY_TO_APPLY",
          reason: "The user supplied an explicit time and this test fixture resolves the plan as Health.",
          payloadJson: {
            title: "Gym",
            startsAt: "2026-08-14T19:00:00.000Z",
            endsAt: "2026-08-14T20:00:00.000Z",
            category: "Health",
            commitment: "Important",
          },
        },
      ],
    };
  },
};

function context(userId: string, requestId: string, receivedAt = "2026-08-13T02:30:00.000Z"): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt,
    requestId,
  };
}

function counterIds() {
  let value = 0;
  return {
    next(prefix: string) {
      value += 1;
      return `${prefix}-authorized-${value}`;
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
    TRUNCATE TABLE routing_proposal, routing_interpretation, capture_record,
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

test("real application adapters bind authenticated RLS scope across Capture -> Review -> Apply", async () => {
  const role = await adminPool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
    [appRole],
  );
  assert.deepEqual(role.rows[0], { rolsuper: false, rolbypassrls: false });

  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  const reader = new PostgresProposalReviewReader(appPool);
  const routingIds = counterIds();
  const commitIds = counterIds();
  let clockTick = 0;
  const clock = {
    now() {
      clockTick += 1;
      return new Date(Date.parse("2026-08-13T02:31:00.000Z") + clockTick * 1000).toISOString();
    },
  };

  const captureReceipt = await captureAndPropose(
    { rawText: "Gym tomorrow at 7" },
    context("user-a", "capture-request-a"),
    { unitOfWork, interpreter, clock, ids: routingIds },
  );

  assert.equal(captureReceipt.proposalIds.length, 1);
  assert.equal(captureReceipt.proposalStates[0], "READY_TO_APPLY");

  const review = await getCaptureProposalReview(
    captureReceipt.captureId,
    { principal: { actorType: "USER", userId: "user-a" } },
    { reader },
  );
  assert.ok(review);
  assert.equal(review.source.rawText, "Gym tomorrow at 7");
  assert.equal(review.source.authorityClass, "USER_SOURCE");
  assert.equal(review.interpretation?.authorityClass, "OBSERVATION");
  assert.equal(review.proposals[0].authorityClass, "SUGGESTION");
  assert.equal(review.proposals[0].proposedResultClass, "FACT");
  assert.equal(review.proposals[0].state, "READY_TO_APPLY");

  const otherUserReview = await getCaptureProposalReview(
    captureReceipt.captureId,
    { principal: { actorType: "USER", userId: "user-b" } },
    { reader },
  );
  assert.equal(otherUserReview, undefined);

  await assert.rejects(
    () => applyCalendarPlanProposal(
      { proposalId: captureReceipt.proposalIds[0], confirmation: { explicit: true } },
      context("user-b", "apply-request-b", "2026-08-13T02:35:00.000Z"),
      { unitOfWork, clock, ids: commitIds },
    ),
    (error: unknown) => error instanceof ProposalValidationError && /unavailable/.test(error.message),
  );

  const applied = await applyCalendarPlanProposal(
    { proposalId: captureReceipt.proposalIds[0], confirmation: { explicit: true } },
    context("user-a", "apply-request-a", "2026-08-13T02:36:00.000Z"),
    { unitOfWork, clock, ids: commitIds },
  );

  assert.equal(applied.idempotentReplay, false);

  const canonical = await ownerPool.query<{
    id: string;
    user_id: string;
    title: string;
    source_proposal_id: string;
  }>("SELECT id, user_id, title, source_proposal_id FROM calendar_event");
  assert.deepEqual(canonical.rows, [{
    id: applied.entityId,
    user_id: "user-a",
    title: "Gym",
    source_proposal_id: captureReceipt.proposalIds[0],
  }]);

  const events = await ownerPool.query<{
    event_id: string;
    user_id: string;
    actor_id: string;
    correlation_id: string;
    event_type: string;
  }>("SELECT event_id, user_id, actor_id, correlation_id, event_type FROM domain_event");
  assert.deepEqual(events.rows, [{
    event_id: applied.eventId,
    user_id: "user-a",
    actor_id: "user-a",
    correlation_id: captureReceipt.correlationId,
    event_type: "CALENDAR_EVENT_CREATED",
  }]);

  const proposal = await ownerPool.query<{ state: string; applied_event_id: string }>(
    "SELECT state, applied_event_id FROM routing_proposal WHERE proposal_id = $1",
    [captureReceipt.proposalIds[0]],
  );
  assert.deepEqual(proposal.rows[0], { state: "APPLIED", applied_event_id: applied.eventId });

  // Without PostgresUserScope, the real application role has no private visibility at all.
  // This proves the adapters are responsible for binding authenticated scope before their SQL runs.
  const unscoped = await appPool.query("SELECT capture_id FROM capture_record");
  assert.equal(unscoped.rowCount, 0);
});

test("private write unit of work rejects an empty authenticated scope before SQL", async () => {
  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  await assert.rejects(
    () => unitOfWork.run("   ", async () => undefined),
    /authenticatedUserId is required/,
  );
});
