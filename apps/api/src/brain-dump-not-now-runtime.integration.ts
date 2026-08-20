import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { PostgresBrainDumpNotNowReader } from "../../../packages/database/postgres-brain-dump-not-now-reader";
import { PostgresBrainDumpNotNowUnitOfWork } from "../../../packages/database/postgres-brain-dump-not-now-unit-of-work";
import { PostgresUserScope } from "../../../packages/database/postgres-user-scope";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { applyApplicationDatabaseRole } from "./application-db-role";
import {
  createBrainDumpNotNowDatabaseReadinessProbe,
} from "./brain-dump-not-now-database-readiness";
import {
  applyBrainDumpNotNowDatabaseRole,
  planBrainDumpNotNowDatabaseRole,
  revokeBrainDumpNotNowDatabaseRole,
} from "./brain-dump-not-now-db-role";
import { confirmBrainDumpClassification } from "./confirm-brain-dump-classification";
import {
  getBrainDumpOverview,
  getNotNowOverview,
} from "./get-brain-dump-not-now-overviews";
import { applyDatabaseMigrations } from "./migration-runner";
import { parkNotNowItem } from "./park-not-now-item";
import { reviewNotNowItem } from "./review-not-now-item";
import { withWebWriteIdempotency, type WebWriteIdempotencyScope } from "./web-write-idempotency";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "brain_dump_not_now_runtime_test";
const roleName = "lifeos_brain_dump_not_now_it";
const password = "Synthetic-Brain-Dump-Password-2026!";
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
  return {
    next(prefix: "classification" | "not-now" | "event") {
      return `${prefix}-runtime-${++value}`;
    },
  };
}

test("Brain Dump + NOT NOW is separately granted, RLS-scoped, versioned, replay-safe, and revocable", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);
  const appPool = applicationPool();
  try {
    const readiness = createBrainDumpNotNowDatabaseReadinessProbe(appPool);
    assert.equal(await readiness.check(), false);

    const beforeGrant = await planBrainDumpNotNowDatabaseRole(migrationPool, roleName);
    assert.equal(beforeGrant.baselineRoleReady, true);
    assert.equal(beforeGrant.tableCount, 2);
    assert.equal(beforeGrant.protectedTableCount, 2);
    assert.equal(beforeGrant.nonOwnerTableCount, 2);
    assert.equal(beforeGrant.leastPrivilegeTableCount, 0);
    assert.equal(beforeGrant.ready, false);

    const granted = await applyBrainDumpNotNowDatabaseRole(migrationPool, roleName);
    assert.equal(granted.ready, true);
    assert.equal(await readiness.check(), true);

    const privileges = await appPool.query(`
      SELECT
        has_table_privilege(current_user, 'brain_dump_classification', 'SELECT') AS classification_select,
        has_table_privilege(current_user, 'brain_dump_classification', 'INSERT') AS classification_insert,
        has_table_privilege(current_user, 'brain_dump_classification', 'UPDATE') AS classification_update,
        has_table_privilege(current_user, 'brain_dump_classification', 'DELETE') AS classification_delete,
        has_table_privilege(current_user, 'not_now_item', 'SELECT') AS not_now_select,
        has_table_privilege(current_user, 'not_now_item', 'INSERT') AS not_now_insert,
        has_table_privilege(current_user, 'not_now_item', 'UPDATE') AS not_now_update,
        has_table_privilege(current_user, 'not_now_item', 'DELETE') AS not_now_delete
    `);
    assert.deepEqual(privileges.rows[0], {
      classification_select: true,
      classification_insert: true,
      classification_update: true,
      classification_delete: false,
      not_now_select: true,
      not_now_insert: true,
      not_now_update: true,
      not_now_delete: false,
    });
    await assert.rejects(() => appPool.query("DELETE FROM not_now_item"), /permission denied/i);

    const captureWrites = new PostgresWriteUnitOfWork(appPool);
    await captureWrites.run("user-a", async (transaction) => {
      await transaction.getOrCreateCaptureRecord({
        captureId: "capture-runtime-1",
        userId: "user-a",
        rawText: "Maybe I should switch projects immediately instead of following the chosen direction.",
        source: "WEB_APP",
        correlationId: "capture-runtime-correlation-1",
        requestId: "capture-runtime-request-1",
        receivedAt: "2026-08-18T19:59:00.000Z",
        recordedAt: "2026-08-18T19:59:01.000Z",
      });
    });

    const unitOfWork = new PostgresBrainDumpNotNowUnitOfWork(appPool);
    const reader = new PostgresBrainDumpNotNowReader(appPool);
    const generator = ids();
    const classificationCommand = {
      category: "NOT_NOW" as const,
      expectedCurrentClassificationId: null,
    };
    const classificationContext = context(
      "BRAIN_DUMP_CLASSIFY",
      "brain-dump-runtime-key-0001",
      "2026-08-18T20:00:00.000Z",
    );
    const classification = await confirmBrainDumpClassification(
      "capture-runtime-1",
      classificationCommand,
      classificationContext,
      { unitOfWork, clock: { now: () => "2026-08-18T20:00:01.000Z" }, ids: generator },
    );
    const replay = await confirmBrainDumpClassification(
      "capture-runtime-1",
      classificationCommand,
      classificationContext,
      { unitOfWork, clock: { now: () => "2026-08-18T20:00:02.000Z" }, ids: generator },
    );
    assert.equal(replay.classificationId, classification.classificationId);
    assert.equal(replay.idempotentReplay, true);

    const parked = await parkNotNowItem({
      captureId: "capture-runtime-1",
      classificationId: classification.classificationId,
      assessment: "TEMPORARY_INSPIRATION",
      posture: "PARK_IT",
      expectedCurrentItemId: null,
    }, context("NOT_NOW_PARK", "not-now-runtime-key-0001", "2026-08-18T20:10:00.000Z"), {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:10:01.000Z" },
      ids: generator,
    });
    await reviewNotNowItem(parked.rootId, {
      targetState: "RESEARCHING",
      expectedCurrentRevision: 1,
      reviewNote: "Research without changing the current direction.",
    }, context("NOT_NOW_REVIEW", "not-now-review-runtime-0001", "2026-08-18T20:20:00.000Z"), {
      unitOfWork,
      clock: { now: () => "2026-08-18T20:20:01.000Z" },
      ids: generator,
    });

    const brainDump = await getBrainDumpOverview("user-a", reader);
    assert.equal(brainDump.items[0]?.rawText, "Maybe I should switch projects immediately instead of following the chosen direction.");
    assert.equal(brainDump.items[0]?.currentClassification?.category, "NOT_NOW");
    const notNow = await getNotNowOverview("user-a", reader);
    assert.equal(notNow.items[0]?.state, "RESEARCHING");
    assert.equal(notNow.items[0]?.revision, 2);
    assert.deepEqual(await getNotNowOverview("user-b", reader), { items: [] });

    const adminScope = new PostgresUserScope(migrationPool);
    const stored = await adminScope.run("user-a", async (client) => {
      const result = await client.query<{
        classification_count: number;
        not_now_revision_count: number;
        event_count: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM brain_dump_classification) AS classification_count,
          (SELECT count(*)::int FROM not_now_item) AS not_now_revision_count,
          (
            SELECT count(*)::int FROM domain_event
             WHERE event_type IN (
               'BRAIN_DUMP_CLASSIFICATION_CONFIRMED',
               'NOT_NOW_ITEM_PARKED',
               'NOT_NOW_ITEM_REVIEWED'
             )
          ) AS event_count
      `);
      return result.rows[0];
    });
    assert.deepEqual(stored, {
      classification_count: 1,
      not_now_revision_count: 2,
      event_count: 3,
    });

    const revoked = await revokeBrainDumpNotNowDatabaseRole(migrationPool, roleName);
    assert.equal(revoked.ready, false);
    assert.equal(revoked.leastPrivilegeTableCount, 0);
    assert.equal(await readiness.check(), false);
  } finally {
    await appPool.end();
  }
});
