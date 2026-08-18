import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { PostgresJourneyPracticeReader } from "../../../packages/database/postgres-journey-practice-reader";
import { PostgresJourneyPracticeUnitOfWork } from "../../../packages/database/postgres-journey-practice-unit-of-work";
import { PostgresUserScope } from "../../../packages/database/postgres-user-scope";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { activateJourney } from "./activate-journey";
import { applyApplicationDatabaseRole } from "./application-db-role";
import { completeJourneyPractice } from "./complete-journey-practice";
import { getJourneyPracticeOverview } from "./get-journey-practice-overview";
import { createJourneyPracticeDatabaseReadinessProbe } from "./journey-practice-database-readiness";
import {
  applyJourneyPracticeDatabaseRole,
  planJourneyPracticeDatabaseRole,
  revokeJourneyPracticeDatabaseRole,
} from "./journey-practice-db-role";
import { applyDatabaseMigrations } from "./migration-runner";
import { startJourneyPractice } from "./start-journey-practice";
import { withWebWriteIdempotency, type WebWriteIdempotencyScope } from "./web-write-idempotency";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "journey_practice_runtime_test";
const roleName = "lifeos_journey_practice_it";
const password = "Synthetic-Journey-Practice-Password-2026!";
const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const migrationPool = new Pool({
  connectionString: databaseUrl,
  max: 4,
  options: `-c search_path=${schema}`,
});

function applicationPool() {
  const url = new URL(databaseUrl!);
  url.username = roleName;
  url.password = password;
  return new Pool({
    connectionString: url.toString(),
    max: 6,
    options: `-c search_path=${schema}`,
  });
}

before(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${roleName}`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);
});

after(async () => {
  await migrationPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${roleName}`);
  await adminPool.end();
});

function context(
  scope: WebWriteIdempotencyScope,
  key: string,
  receivedAt: string,
): WriteRequestContext {
  return withWebWriteIdempotency({
    principal: { actorType: "USER", userId: "user-a" },
    source: "WEB_APP",
    receivedAt,
    requestId: "transport-request",
  }, scope, key);
}

function ids() {
  let value = 0;
  return { next: (prefix: string) => `${prefix}-runtime-${++value}` };
}

test("Journey practice is append-only, RLS-scoped, replay-safe, atomic, and revocable", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);
  const appPool = applicationPool();
  try {
    const readiness = createJourneyPracticeDatabaseReadinessProbe(appPool);
    assert.equal(await readiness.check(), false);

    const beforeGrant = await planJourneyPracticeDatabaseRole(migrationPool, roleName);
    assert.equal(beforeGrant.baselineRoleReady, true);
    assert.equal(beforeGrant.tableCount, 3);
    assert.equal(beforeGrant.protectedTableCount, 3);
    assert.equal(beforeGrant.nonOwnerTableCount, 3);
    assert.equal(beforeGrant.leastPrivilegeTableCount, 0);
    assert.equal(beforeGrant.ready, false);

    const granted = await applyJourneyPracticeDatabaseRole(migrationPool, roleName);
    assert.equal(granted.ready, true);
    assert.equal(await readiness.check(), true);

    const privileges = await appPool.query(`
      SELECT
        has_table_privilege(current_user, 'journey_capability_decision', 'SELECT') AS decision_select,
        has_table_privilege(current_user, 'journey_capability_decision', 'INSERT') AS decision_insert,
        has_table_privilege(current_user, 'journey_capability_decision', 'UPDATE') AS decision_update,
        has_table_privilege(current_user, 'journey_practice_session', 'SELECT') AS session_select,
        has_table_privilege(current_user, 'journey_practice_session', 'INSERT') AS session_insert,
        has_table_privilege(current_user, 'journey_practice_session', 'UPDATE') AS session_update,
        has_table_privilege(current_user, 'journey_practice_completion', 'SELECT') AS completion_select,
        has_table_privilege(current_user, 'journey_practice_completion', 'INSERT') AS completion_insert,
        has_table_privilege(current_user, 'journey_practice_completion', 'UPDATE') AS completion_update,
        has_table_privilege(current_user, 'journey_practice_completion', 'DELETE') AS completion_delete
    `);
    assert.deepEqual(privileges.rows[0], {
      decision_select: true,
      decision_insert: true,
      decision_update: false,
      session_select: true,
      session_insert: true,
      session_update: false,
      completion_select: true,
      completion_insert: true,
      completion_update: false,
      completion_delete: false,
    });
    await assert.rejects(
      () => appPool.query("UPDATE journey_practice_session SET technique = 'SILENCE'"),
      /permission denied/i,
    );
    await assert.rejects(
      () => appPool.query("DELETE FROM journey_practice_completion"),
      /permission denied/i,
    );

    const unitOfWork = new PostgresJourneyPracticeUnitOfWork(appPool);
    const reader = new PostgresJourneyPracticeReader(appPool);
    const generator = ids();
    const activationContext = context(
      "JOURNEY_ACTIVATE",
      "journey-activation-runtime-0001",
      "2026-08-18T20:00:00.000Z",
    );
    const activation = await activateJourney({
      journeyCode: "TRAVEL_CREATOR",
      capabilityCode: "SOUND_DESIGN",
      startingTechnique: "ENVIRONMENTAL_SOUND",
      decisionReason: "Synthetic explicit Journey decision.",
    }, activationContext, {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:00:01.000Z" },
      ids: generator,
    });
    const activationReplay = await activateJourney({
      journeyCode: "TRAVEL_CREATOR",
      capabilityCode: "SOUND_DESIGN",
      startingTechnique: "ENVIRONMENTAL_SOUND",
      decisionReason: "Synthetic explicit Journey decision.",
    }, activationContext, {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:00:02.000Z" },
      ids: generator,
    });
    assert.equal(activationReplay.decisionId, activation.decisionId);
    assert.equal(activationReplay.idempotentReplay, true);

    const start = await startJourneyPractice({
      technique: "J_L_CUTS",
      experimentIntention: "Synthetic sound arrives before picture.",
    }, context(
      "JOURNEY_PRACTICE_START",
      "journey-practice-runtime-0001",
      "2026-08-18T20:10:00.000Z",
    ), {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:10:01.000Z" },
      ids: generator,
    });
    const completion = await completeJourneyPractice(start.sessionId, {
      reflectionNote: "Synthetic transition felt calmer.",
      retainedLearningCandidate: "Synthetic continuity came from sound.",
    }, context(
      "JOURNEY_PRACTICE_COMPLETE",
      "journey-completion-runtime-0001",
      "2026-08-18T20:52:00.000Z",
    ), {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:52:01.000Z" },
      ids: generator,
    });
    assert.equal(completion.durationSeconds, 2520);

    const overview = await getJourneyPracticeOverview("user-a", reader);
    assert.equal(overview.activation?.authorityClass, "DECISION");
    assert.equal(overview.openSession, null);
    assert.equal(overview.completedSessions.length, 1);
    assert.equal(overview.practiceCounts.J_L_CUTS, 1);
    assert.deepEqual(await getJourneyPracticeOverview("user-b", reader), {
      activation: null,
      openSession: null,
      completedSessions: [],
      practiceCounts: {},
    });

    const adminScope = new PostgresUserScope(migrationPool);
    const stored = await adminScope.run("user-a", async (client) => {
      const result = await client.query<{
        decisions: number;
        sessions: number;
        completions: number;
        events: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM journey_capability_decision) AS decisions,
          (SELECT count(*)::int FROM journey_practice_session) AS sessions,
          (SELECT count(*)::int FROM journey_practice_completion) AS completions,
          (
            SELECT count(*)::int FROM domain_event
             WHERE event_type IN (
               'JOURNEY_CAPABILITY_ACTIVATED',
               'JOURNEY_PRACTICE_STARTED',
               'JOURNEY_PRACTICE_COMPLETED'
             )
          ) AS events
      `);
      return result.rows[0];
    });
    assert.deepEqual(stored, {
      decisions: 1,
      sessions: 1,
      completions: 1,
      events: 3,
    });

    const payloads = await adminScope.run("user-a", async (client) => client.query<{ payload: string }>(`
      SELECT payload_json::text AS payload FROM domain_event
       WHERE event_type LIKE 'JOURNEY_%'
    `));
    const payloadJson = JSON.stringify(payloads.rows);
    for (const privateText of [
      "Synthetic explicit Journey decision",
      "Synthetic sound arrives",
      "Synthetic transition felt calmer",
      "Synthetic continuity came from sound",
    ]) {
      assert.equal(payloadJson.includes(privateText), false);
    }

    const revoked = await revokeJourneyPracticeDatabaseRole(migrationPool, roleName);
    assert.equal(revoked.ready, false);
    assert.equal(revoked.leastPrivilegeTableCount, 0);
    assert.equal(await readiness.check(), false);
  } finally {
    await appPool.end();
  }
});
