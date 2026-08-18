import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { PostgresDailyReturnReader } from "../../../packages/database/postgres-daily-return-reader";
import { PostgresDailyReturnUnitOfWork } from "../../../packages/database/postgres-daily-return-unit-of-work";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { appendDailyLogEntry } from "./append-daily-log-entry";
import { applyApplicationDatabaseRole } from "./application-db-role";
import { createPrivateDatabaseReadinessProbe } from "./api-runtime";
import { createDailyReturnDatabaseReadinessProbe } from "./daily-return-database-readiness";
import {
  applyDailyReturnDatabaseRole,
  planDailyReturnDatabaseRole,
  revokeDailyReturnDatabaseRole,
} from "./daily-return-db-role";
import { getDailyReturnOverview } from "./get-daily-return-overview";
import { applyDatabaseMigrations } from "./migration-runner";
import { submitDailyReturnReview } from "./submit-daily-return-review";
import { withWebWriteIdempotency } from "./web-write-idempotency";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "daily_return_runtime_test";
const roleName = "lifeos_daily_return_it";
const password = "Synthetic-Daily-Reflection-Password-2026!";

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
  userId: string,
  scope: "DAILY_LOG_APPEND" | "DAILY_RETURN_SUBMIT",
  key: string,
  receivedAt: string,
): WriteRequestContext {
  return withWebWriteIdempotency(
    {
      principal: { actorType: "USER", userId },
      source: "WEB_APP",
      receivedAt,
      requestId: "transport-request",
    },
    scope,
    key,
  );
}

function ids(namespace: string) {
  let log = 0;
  let review = 0;
  let event = 0;
  return {
    next(prefix: "daily-log" | "daily-review" | "event") {
      if (prefix === "daily-log") return `daily-log-${namespace}-${++log}`;
      if (prefix === "daily-review") return `daily-review-${namespace}-${++review}`;
      return `event-${namespace}-${++event}`;
    },
  };
}

test("Daily Return is separately granted, RLS-scoped, replay-safe and revocable", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);

  const appPool = applicationPool();
  try {
    const baseline = createPrivateDatabaseReadinessProbe(appPool);
    const dailyReturn = createDailyReturnDatabaseReadinessProbe(appPool);

    assert.equal(await baseline.check(), true);
    assert.equal(await dailyReturn.check(), false);

    const beforeGrant = await planDailyReturnDatabaseRole(migrationPool, roleName);
    assert.equal(beforeGrant.baselineRoleReady, true);
    assert.equal(beforeGrant.tableCount, 2);
    assert.equal(beforeGrant.protectedTableCount, 2);
    assert.equal(beforeGrant.nonOwnerTableCount, 2);
    assert.equal(beforeGrant.leastPrivilegeTableCount, 0);
    assert.equal(beforeGrant.ready, false);

    const granted = await applyDailyReturnDatabaseRole(migrationPool, roleName);
    assert.equal(granted.ready, true);
    assert.equal(granted.leastPrivilegeTableCount, 2);
    assert.equal(await baseline.check(), true);
    assert.equal(await dailyReturn.check(), true);

    const privileges = await appPool.query(`
      SELECT
        has_table_privilege(current_user, 'daily_log_entry', 'SELECT') AS log_select,
        has_table_privilege(current_user, 'daily_log_entry', 'INSERT') AS log_insert,
        has_table_privilege(current_user, 'daily_log_entry', 'UPDATE') AS log_update,
        has_table_privilege(current_user, 'daily_log_entry', 'DELETE') AS log_delete,
        has_table_privilege(current_user, 'daily_return_review', 'SELECT') AS review_select,
        has_table_privilege(current_user, 'daily_return_review', 'INSERT') AS review_insert,
        has_table_privilege(current_user, 'daily_return_review', 'UPDATE') AS review_update,
        has_table_privilege(current_user, 'daily_return_review', 'DELETE') AS review_delete
    `);
    assert.deepEqual(privileges.rows[0], {
      log_select: true,
      log_insert: true,
      log_update: false,
      log_delete: false,
      review_select: true,
      review_insert: true,
      review_update: true,
      review_delete: false,
    });

    await assert.rejects(
      () => appPool.query("UPDATE daily_log_entry SET body = 'changed'"),
      /permission denied/i,
    );
    await assert.rejects(
      () => appPool.query("DELETE FROM daily_return_review"),
      /permission denied/i,
    );

    const unitOfWork = new PostgresDailyReturnUnitOfWork(appPool);
    const reader = new PostgresDailyReturnReader(appPool);
    const generator = ids("runtime");

    const logCommand = {
      localDate: "2026-08-18",
      timeZone: "Asia/Kolkata",
      body: "Work was heavy; one attentive listening exercise still happened.",
      occurredAt: "2026-08-18T18:30:00.000Z",
    };
    const logContext = context(
      "user-a",
      "DAILY_LOG_APPEND",
      "daily-log-runtime-key-0001",
      "2026-08-18T20:00:00.000Z",
    );
    const firstLog = await appendDailyLogEntry(logCommand, logContext, {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:00:01.000Z" },
      ids: generator,
    });
    const replay = await appendDailyLogEntry(logCommand, logContext, {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:00:02.000Z" },
      ids: generator,
    });
    assert.equal(replay.entryId, firstLog.entryId);
    assert.equal(replay.idempotentReplay, true);

    const reviewCommand = {
      localDate: "2026-08-18",
      timeZone: "Asia/Kolkata",
      whatHappened: "I worked, trained, and paid attention to sound.",
      whatMovedForward: "I practised one transition.",
      whatPulledMeAway: "Comparison with finished work.",
      returnToTomorrow: "One small listening exercise after work.",
      returnState: "RETURNED" as const,
      expectedCurrentReviewId: null,
    };
    const firstReview = await submitDailyReturnReview(
      reviewCommand,
      context(
        "user-a",
        "DAILY_RETURN_SUBMIT",
        "daily-return-runtime-key-0001",
        "2026-08-18T20:10:00.000Z",
      ),
      {
        unitOfWork,
        clock: { now: () => "2026-08-18T20:10:01.000Z" },
        ids: generator,
      },
    );
    await submitDailyReturnReview(
      {
        ...reviewCommand,
        returnToTomorrow: "Return calmly, practise once, and rest.",
        returnState: "STILL_RETURNING",
        expectedCurrentReviewId: firstReview.reviewId,
      },
      context(
        "user-a",
        "DAILY_RETURN_SUBMIT",
        "daily-return-runtime-key-0002",
        "2026-08-18T20:20:00.000Z",
      ),
      {
        unitOfWork,
        clock: { now: () => "2026-08-18T20:20:01.000Z" },
        ids: generator,
      },
    );

    const owner = await getDailyReturnOverview(
      { principal: { actorType: "USER", userId: "user-a" }, localDate: "2026-08-18" },
      { reader },
    );
    assert.equal(owner.logEntries.length, 1);
    assert.equal(owner.currentReview?.returnState, "STILL_RETURNING");
    assert.equal(owner.reviewHistory.length, 1);

    const other = await getDailyReturnOverview(
      { principal: { actorType: "USER", userId: "user-b" }, localDate: "2026-08-18" },
      { reader },
    );
    assert.deepEqual(other, {
      localDate: "2026-08-18",
      logEntries: [],
      currentReview: null,
      reviewHistory: [],
    });

    const stored = await migrationPool.query<{
      log_count: number;
      review_count: number;
      event_count: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM daily_log_entry) AS log_count,
        (SELECT count(*)::int FROM daily_return_review) AS review_count,
        (
          SELECT count(*)::int
          FROM domain_event
          WHERE event_type IN (
            'DAILY_LOG_ENTRY_RECORDED',
            'DAILY_RETURN_REVIEW_SUBMITTED',
            'DAILY_RETURN_REVIEW_REVISED'
          )
        ) AS event_count
    `);
    assert.deepEqual(stored.rows[0], {
      log_count: 1,
      review_count: 2,
      event_count: 3,
    });

    const revoked = await revokeDailyReturnDatabaseRole(migrationPool, roleName);
    assert.equal(revoked.ready, false);
    assert.equal(revoked.leastPrivilegeTableCount, 0);
    assert.equal(await baseline.check(), true);
    assert.equal(await dailyReturn.check(), false);
  } finally {
    await appPool.end();
  }
});
