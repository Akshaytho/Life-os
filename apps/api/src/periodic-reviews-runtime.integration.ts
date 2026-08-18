import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { PostgresPeriodicReviewReader } from "../../../packages/database/postgres-periodic-review-reader";
import { PostgresPeriodicReviewUnitOfWork } from "../../../packages/database/postgres-periodic-review-unit-of-work";
import { applyApplicationDatabaseRole } from "./application-db-role";
import { applyBrainDumpNotNowDatabaseRole } from "./brain-dump-not-now-db-role";
import { applyDailyReturnDatabaseRole } from "./daily-return-db-role";
import { applyDriftDatabaseRole } from "./drift-db-role";
import { applyJourneyPracticeDatabaseRole } from "./journey-practice-db-role";
import { applyDatabaseMigrations } from "./migration-runner";
import { createPeriodicReviewsDatabaseReadinessProbe } from "./periodic-reviews-database-readiness";
import {
  applyPeriodicReviewsDatabaseRole,
  revokePeriodicReviewsDatabaseRole,
} from "./periodic-reviews-db-role";
import { submitPeriodicReview } from "./submit-periodic-review";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "periodic_reviews_runtime_test";
const roleName = "lifeos_periodic_reviews_it";
const password = "Synthetic-Periodic-Reviews-Password-2026!";
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

function command(carryForward: string) {
  return {
    kind: "WEEK" as const,
    periodStart: "2026-08-17",
    periodEnd: "2026-08-23",
    timeZone: "Asia/Kolkata",
    whatMattered: "Synthetic direction stayed visible.",
    whatChanged: "Synthetic return became smaller.",
    whatMovedForward: "Synthetic practice evidence moved forward.",
    driftAndReturn: "Synthetic comparison was followed by return.",
    whatWasLearned: "Synthetic short experiments stayed useful.",
    carryForward,
    expectedCurrentReviewId: null,
  };
}

test("Periodic Reviews is versioned, content-minimal, forced-RLS scoped, and revocable on real PostgreSQL", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);
  await applyDailyReturnDatabaseRole(migrationPool, roleName);
  await applyBrainDumpNotNowDatabaseRole(migrationPool, roleName);
  await applyDriftDatabaseRole(migrationPool, roleName);
  await applyJourneyPracticeDatabaseRole(migrationPool, roleName);
  await applyPeriodicReviewsDatabaseRole(migrationPool, roleName);

  const appPool = applicationPool();
  try {
    assert.equal(await createPeriodicReviewsDatabaseReadinessProbe(appPool).check(), true);
    const unitOfWork = new PostgresPeriodicReviewUnitOfWork(appPool);
    const reader = new PostgresPeriodicReviewReader(appPool);
    let id = 0;
    const dependencies = {
      unitOfWork,
      clock: { now: () => "2026-08-23T18:00:01.000Z" },
      ids: { next: (prefix: "periodic-review" | "event") => `${prefix}-${++id}` },
    };
    const context = (userId: string, seed: string) => ({
      principal: { actorType: "USER" as const, userId },
      requestId: `web-idem-v1:periodic_review_submit:${seed.repeat(64).slice(0, 64)}`,
      source: "WEB_APP" as const,
      receivedAt: "2026-08-23T18:00:00.000Z",
    });
    await submitPeriodicReview(command("Synthetic carry forward A."), context("user-a", "a"), dependencies);
    await submitPeriodicReview(command("Synthetic carry forward B."), context("user-b", "b"), dependencies);

    const userA = await reader.listReviews("user-a", command("unused"), 4);
    const userB = await reader.listReviews("user-b", command("unused"), 4);
    assert.equal(userA.length, 1);
    assert.equal(userB.length, 1);
    assert.match(userA[0]!.carryForward, /A/);
    assert.doesNotMatch(userA[0]!.carryForward, /B/);
    assert.match(userB[0]!.carryForward, /B/);
    assert.equal(userA[0]!.status, "CURRENT");

    const unscoped = await appPool.query<{ count: number }>("SELECT count(*)::int AS count FROM periodic_review");
    assert.equal(unscoped.rows[0]?.count, 0);
    const events = await migrationPool.query<{ event_type: string; payload_json: Record<string, unknown> }>(`
      SELECT event_type, payload_json FROM domain_event
       WHERE event_type = 'PERIODIC_REVIEW_SUBMITTED' ORDER BY entity_id
    `);
    assert.equal(events.rows.length, 2);
    assert.deepEqual(Object.keys(events.rows[0]!.payload_json).sort(), [
      "authorityClass", "kind", "periodEnd", "periodStart", "timeZone",
    ]);

    const revoked = await revokePeriodicReviewsDatabaseRole(migrationPool, roleName);
    assert.equal(revoked.ready, false);
    assert.equal(await createPeriodicReviewsDatabaseReadinessProbe(appPool).check(), false);
  } finally { await appPool.end() }
});
