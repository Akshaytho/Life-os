import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { PostgresMemoryReader } from "../../../packages/database/postgres-memory-reader";
import { PostgresMemoryUnitOfWork } from "../../../packages/database/postgres-memory-unit-of-work";
import { PostgresJourneyPracticeUnitOfWork } from "../../../packages/database/postgres-journey-practice-unit-of-work";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { activateJourney } from "./activate-journey";
import { applyApplicationDatabaseRole } from "./application-db-role";
import { applyDirectionDatabaseRole } from "./direction-db-role";
import { applyJourneyPracticeDatabaseRole } from "./journey-practice-db-role";
import { completeJourneyPractice } from "./complete-journey-practice";
import { applyDatabaseMigrations } from "./migration-runner";
import { createMemoryDatabaseReadinessProbe } from "./memory-database-readiness";
import { applyMemoryDatabaseRole, revokeMemoryDatabaseRole } from "./memory-db-role";
import { applyPeriodicReviewsDatabaseRole } from "./periodic-reviews-db-role";
import { retainMemoryItem } from "./retain-memory-item";
import { reviseMemoryItem } from "./revise-memory-item";
import { startJourneyPractice } from "./start-journey-practice";
import { withWebWriteIdempotency, type WebWriteIdempotencyScope } from "./web-write-idempotency";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "memory_runtime_test";
const roleName = "lifeos_memory_it";
const password = "Synthetic-Memory-Password-2026!";
const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const migrationPool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });

function applicationPool() {
  const url = new URL(databaseUrl!);
  url.username = roleName;
  url.password = password;
  return new Pool({ connectionString: url.toString(), max: 6, options: `-c search_path=${schema}` });
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

function context(scope: WebWriteIdempotencyScope, key: string, receivedAt: string): WriteRequestContext {
  return withWebWriteIdempotency({
    principal: { actorType: "USER", userId: "user-a" }, source: "WEB_APP",
    receivedAt, requestId: "transport-request",
  }, scope, key);
}

function ids() {
  let value = 0;
  return { next: (prefix: string) => `${prefix}-memory-runtime-${++value}` };
}

test("Memory is source-linked, versioned, content-minimal, RLS-scoped, and revocable on real PostgreSQL", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);
  await applyDirectionDatabaseRole(migrationPool, roleName);
  await applyJourneyPracticeDatabaseRole(migrationPool, roleName);
  await applyPeriodicReviewsDatabaseRole(migrationPool, roleName);
  await applyMemoryDatabaseRole(migrationPool, roleName);

  const appPool = applicationPool();
  try {
    assert.equal(await createMemoryDatabaseReadinessProbe(appPool).check(), true);
    const generator = ids();
    const journeyUnit = new PostgresJourneyPracticeUnitOfWork(appPool);
    const journeyDependencies = {
      unitOfWork: journeyUnit,
      clock: { now: () => "2026-08-20T14:00:01.000Z" },
      ids: generator,
    };
    await activateJourney({
      journeyCode: "TRAVEL_CREATOR", capabilityCode: "SOUND_DESIGN",
      startingTechnique: "ENVIRONMENTAL_SOUND", decisionReason: "Synthetic Memory integration activation.",
    }, context("JOURNEY_ACTIVATE", "memory-journey-activation-0001", "2026-08-20T13:00:00.000Z"), journeyDependencies);
    const session = await startJourneyPractice({
      technique: "ENVIRONMENTAL_SOUND", experimentIntention: "Synthetic short A/B comparison.",
    }, context("JOURNEY_PRACTICE_START", "memory-journey-practice-0001", "2026-08-20T13:30:00.000Z"), journeyDependencies);
    const completion = await completeJourneyPractice(session.sessionId, {
      reflectionNote: "Synthetic comparison stayed controlled.",
      retainedLearningCandidate: "Synthetic short comparisons make layers easier to hear.",
    }, context("JOURNEY_PRACTICE_COMPLETE", "memory-journey-complete-0001", "2026-08-20T14:00:00.000Z"), journeyDependencies);

    const memoryUnit = new PostgresMemoryUnitOfWork(appPool);
    const memoryDependencies = {
      unitOfWork: memoryUnit,
      clock: { now: () => "2026-08-20T14:10:01.000Z" },
      ids: generator,
    };
    const retained = await retainMemoryItem({
      sourceDomain: "JOURNEY_PRACTICE", sourceEntityId: completion.completionId,
      kind: "LEARNING", title: "Synthetic layers became audible",
      body: "Synthetic controlled comparisons made the environmental layer easier to distinguish.",
      relationship: "NEW",
    }, context("MEMORY_RETAIN", "memory-retain-runtime-0001", "2026-08-20T14:10:00.000Z"), memoryDependencies);
    const revised = await reviseMemoryItem(retained.rootId, {
      expectedCurrentItemId: retained.itemId, kind: "LEARNING",
      title: "Synthetic comparison reveals layers",
      body: "Synthetic short A/B comparisons made environmental layers easier to distinguish before adding complexity.",
    }, context("MEMORY_REVISE", "memory-revise-runtime-0001", "2026-08-20T15:00:00.000Z"), {
      ...memoryDependencies, clock: { now: () => "2026-08-20T15:00:01.000Z" },
    });
    assert.equal(revised.rootId, retained.rootId);
    assert.equal(revised.revision, 2);

    const reader = new PostgresMemoryReader(appPool);
    const userA = await reader.getOverview("user-a", {
      timeZone: "UTC", now: "2026-08-20T15:10:00.000Z", query: "comparison",
    });
    const userB = await reader.getOverview("user-b", {
      timeZone: "UTC", now: "2026-08-20T15:10:00.000Z",
    });
    assert.equal(userA.items.length, 1);
    assert.equal(userA.items[0]!.revision, 2);
    assert.equal(userA.items[0]!.history.length, 1);
    assert.equal(userA.items[0]!.source.entityId, completion.completionId);
    assert.equal(userA.candidates[0]!.retainedRootId, retained.rootId);
    assert.deepEqual(userB.items, []);
    assert.deepEqual(userB.candidates, []);

    const unscoped = await appPool.query<{ count: number }>("SELECT count(*)::int AS count FROM memory_item");
    assert.equal(unscoped.rows[0]?.count, 0);
    const events = await migrationPool.query<{ payload: string }>(`
      SELECT payload_json::text AS payload FROM domain_event
       WHERE event_type IN ('MEMORY_ITEM_RETAINED', 'MEMORY_ITEM_REVISED')
       ORDER BY occurred_at
    `);
    assert.equal(events.rows.length, 2);
    const payload = JSON.stringify(events.rows);
    for (const privateText of ["layers became audible", "controlled comparisons", "environmental layers"]) {
      assert.equal(payload.toLowerCase().includes(privateText.toLowerCase()), false);
    }

    const revoked = await revokeMemoryDatabaseRole(migrationPool, roleName);
    assert.equal(revoked.ready, false);
    assert.equal(await createMemoryDatabaseReadinessProbe(appPool).check(), false);
  } finally { await appPool.end() }
});
