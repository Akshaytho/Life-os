import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { PostgresBrainDumpNotNowReader } from "../../../packages/database/postgres-brain-dump-not-now-reader";
import { PostgresCanonicalCalendarReader } from "../../../packages/database/postgres-canonical-calendar-reader";
import { PostgresDailyReturnReader } from "../../../packages/database/postgres-daily-return-reader";
import { PostgresDirectionDecisionReader } from "../../../packages/database/postgres-direction-decision-reader";
import { PostgresDriftReader } from "../../../packages/database/postgres-drift-reader";
import { PostgresJourneyPracticeReader } from "../../../packages/database/postgres-journey-practice-reader";
import { PostgresUserScope } from "../../../packages/database/postgres-user-scope";
import type { LifeOsAssistant, LifeOsAssistantInput } from "../../../packages/intelligence/life-os-assistant";
import { createAiRetrievalDatabaseReadinessProbe } from "./ai-retrieval-database-readiness";
import { askLifeOs } from "./ask-life-os";
import { applyApplicationDatabaseRole } from "./application-db-role";
import { applyBrainDumpNotNowDatabaseRole } from "./brain-dump-not-now-db-role";
import { applyDailyReturnDatabaseRole } from "./daily-return-db-role";
import { applyDirectionDatabaseRole } from "./direction-db-role";
import { applyDriftDatabaseRole } from "./drift-db-role";
import { applyJourneyPracticeDatabaseRole } from "./journey-practice-db-role";
import { applyDatabaseMigrations } from "./migration-runner";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "ai_retrieval_runtime_test";
const roleName = "lifeos_ai_retrieval_it";
const password = "Synthetic-AI-Retrieval-Password-2026!";
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
    max: 8,
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

class InspectingAssistant implements LifeOsAssistant {
  readonly calls: LifeOsAssistantInput[] = [];

  async answer(input: LifeOsAssistantInput) {
    this.calls.push(structuredClone(input));
    return {
      answer: "The current explicit direction is the strongest source in this synthetic context.",
      citedSourceIds: [input.sources[0]!.sourceId],
      modelName: "fixture-no-network",
    };
  }
}

function command() {
  return {
    mode: "ASK" as const,
    question: "What is current?",
    localDate: "2026-08-19",
    timeZone: "Asia/Kolkata",
    calendarFrom: "2026-08-19T00:00:00.000Z",
    calendarTo: "2026-08-26T00:00:00.000Z",
  };
}

test("AI retrieval is read-only, forced-RLS scoped, and source-visible on real PostgreSQL", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);
  await applyDirectionDatabaseRole(migrationPool, roleName);
  await applyDailyReturnDatabaseRole(migrationPool, roleName);
  await applyBrainDumpNotNowDatabaseRole(migrationPool, roleName);
  await applyDriftDatabaseRole(migrationPool, roleName);
  await applyJourneyPracticeDatabaseRole(migrationPool, roleName);

  const appPool = applicationPool();
  try {
    const readiness = createAiRetrievalDatabaseReadinessProbe(appPool);
    assert.equal(await readiness.check(), true);

    const adminScope = new PostgresUserScope(migrationPool);
    for (const [userId, directionId, statement] of [
      ["user-a", "direction-user-a", "Synthetic direction visible only to user A."],
      ["user-b", "direction-user-b", "Synthetic direction visible only to user B."],
    ] as const) {
      await adminScope.run(userId, async (client) => {
        await client.query(`
          INSERT INTO direction_decision
            (direction_id, user_id, statement, status, decided_at, recorded_at,
             request_id, request_fingerprint)
          VALUES ($1, $2, $3, 'ACTIVE', '2026-08-12T09:00:00.000Z',
                  '2026-08-12T09:00:01.000Z', $4, $5)
        `, [directionId, userId, statement, `request-${userId}`, userId === "user-a" ? "a".repeat(64) : "b".repeat(64)]);
      });
    }

    const assistant = new InspectingAssistant();
    const common = {
      assistant,
      directionReader: new PostgresDirectionDecisionReader(appPool),
      calendarReader: new PostgresCanonicalCalendarReader(appPool),
      dailyReturnReader: new PostgresDailyReturnReader(appPool),
      brainDumpNotNowReader: new PostgresBrainDumpNotNowReader(appPool),
      driftReader: new PostgresDriftReader(appPool),
      journeyPracticeReader: new PostgresJourneyPracticeReader(appPool),
      clock: { now: () => "2026-08-19T12:00:00.000Z" },
    };

    const before = await migrationPool.query<{ count: number }>(`
      SELECT (
        (SELECT count(*) FROM direction_decision)
        + (SELECT count(*) FROM daily_log_entry)
        + (SELECT count(*) FROM daily_return_review)
        + (SELECT count(*) FROM not_now_item)
        + (SELECT count(*) FROM drift_occurrence)
        + (SELECT count(*) FROM journey_practice_session)
        + (SELECT count(*) FROM domain_event)
      )::int AS count
    `);

    const userA = await askLifeOs(command(), { actorType: "USER", userId: "user-a" }, common);
    const userB = await askLifeOs(command(), { actorType: "USER", userId: "user-b" }, common);

    assert.equal(userA.sources.length, 1);
    assert.equal(userB.sources.length, 1);
    assert.match(userA.sources[0]!.excerpt, /user A/);
    assert.doesNotMatch(userA.sources[0]!.excerpt, /user B/);
    assert.match(userB.sources[0]!.excerpt, /user B/);
    assert.doesNotMatch(userB.sources[0]!.excerpt, /user A/);
    assert.equal(userA.sources[0]!.authorityClass, "DECISION");
    assert.equal(userA.answerAuthority, "AI_OBSERVATION");
    assert.equal(assistant.calls.length, 2);

    const after = await migrationPool.query<{ count: number }>(`
      SELECT (
        (SELECT count(*) FROM direction_decision)
        + (SELECT count(*) FROM daily_log_entry)
        + (SELECT count(*) FROM daily_return_review)
        + (SELECT count(*) FROM not_now_item)
        + (SELECT count(*) FROM drift_occurrence)
        + (SELECT count(*) FROM journey_practice_session)
        + (SELECT count(*) FROM domain_event)
      )::int AS count
    `);
    assert.equal(after.rows[0]?.count, before.rows[0]?.count);

    const unscoped = await appPool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM direction_decision",
    );
    assert.equal(unscoped.rows[0]?.count, 0);
  } finally {
    await appPool.end();
  }
});
