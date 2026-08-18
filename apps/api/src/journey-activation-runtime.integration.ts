import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { applyApplicationDatabaseRole } from "./application-db-role";
import { createPrivateDatabaseReadinessProbe } from "./api-runtime";
import { createLifeOsApiServer } from "./api-server";
import { combineReadinessProbes } from "./direction-database-readiness";
import {
  createJourneyDatabaseReadinessProbe,
} from "./journey-database-readiness";
import {
  applyJourneyDatabaseRole,
  planJourneyDatabaseRole,
  revokeJourneyDatabaseRole,
} from "./journey-db-role";
import { applyDatabaseMigrations } from "./migration-runner";
import { createPrivateApiRuntimeDependencies } from "./private-api-runtime";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "journey_activation_runtime_test";
const roleName = "lifeos_journey_runtime_it";
const password = "Synthetic-Journey-Capability-Password-2026!";

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
    max: 5,
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

async function listen(server: ReturnType<typeof createLifeOsApiServer>) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.close();
      await once(server, "close");
    },
  };
}

function auth(token = "owner-token") {
  return { authorization: `Bearer ${token}` };
}

test("Journey activation is separately provisioned, RLS-scoped, revocable and does not widen baseline authority", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);

  const appPool = applicationPool();
  try {
    const baseline = createPrivateDatabaseReadinessProbe(appPool);
    const journey = createJourneyDatabaseReadinessProbe(appPool);

    assert.equal(await baseline.check(), true, "baseline private runtime must remain ready after migration 0008");
    assert.equal(await journey.check(), false, "Journey must remain unready before its separate narrow grant");

    const beforeGrant = await planJourneyDatabaseRole(migrationPool, roleName);
    assert.equal(beforeGrant.baselineRoleReady, true);
    assert.equal(beforeGrant.tableExists, true);
    assert.equal(beforeGrant.protectedByForcedRls, true);
    assert.equal(beforeGrant.requiredPrivileges, false);
    assert.equal(beforeGrant.ready, false);

    const granted = await applyJourneyDatabaseRole(migrationPool, roleName);
    assert.equal(granted.ready, true);
    assert.equal(granted.requiredPrivileges, true);
    assert.equal(granted.forbiddenPrivilegesAbsent, true);
    assert.equal(await baseline.check(), true);
    assert.equal(await journey.check(), true);
    assert.equal(await combineReadinessProbes(baseline, journey).check(), true);

    const privilegeProof = await appPool.query(`
      SELECT
        has_table_privilege(current_user, 'journey_decision', 'SELECT') AS can_select,
        has_table_privilege(current_user, 'journey_decision', 'INSERT') AS can_insert,
        has_table_privilege(current_user, 'journey_decision', 'UPDATE') AS can_update,
        has_table_privilege(current_user, 'journey_decision', 'DELETE') AS can_delete,
        has_table_privilege(current_user, 'journey_decision', 'TRUNCATE') AS can_truncate,
        has_table_privilege(current_user, 'journey_decision', 'REFERENCES') AS can_references,
        has_table_privilege(current_user, 'journey_decision', 'TRIGGER') AS can_trigger
    `);
    assert.deepEqual(privilegeProof.rows[0], {
      can_select: true,
      can_insert: true,
      can_update: true,
      can_delete: false,
      can_truncate: false,
      can_references: false,
      can_trigger: false,
    });

    await assert.rejects(() => appPool.query("DELETE FROM journey_decision"), /permission denied/i);

    let uuid = 0;
    let operationMs = 1000;
    const runtime = { environment: "ci" as const, releaseSha: "journey-activation-runtime", platform: "CI" as const };
    const privateApi = createPrivateApiRuntimeDependencies(
      appPool,
      {},
      runtime,
      { emit() {} },
      {
        journeyEnabled: true,
        sessionVerifier: {
          async verify(token: string) {
            if (token === "owner-token") return { userId: "owner-user" };
            if (token === "other-token") return { userId: "other-user" };
            return undefined;
          },
        },
        randomUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
        now: () => new Date("2026-08-18T09:00:00.000Z"),
        monotonicNowMs: () => ++operationMs,
      },
    );

    const running = await listen(createLifeOsApiServer({
      health: { provenance: runtime, readiness: combineReadinessProbes(baseline, journey) },
      privateApi,
    }));

    try {
      const empty = await fetch(`${running.baseUrl}/api/v1/journey`, { headers: auth() });
      assert.equal(empty.status, 200);
      assert.deepEqual(await empty.json(), { current: null, history: [] });

      const command = {
        name: "Travel Creator",
        activeCapability: "Sound Design",
        expectedCurrentJourneyId: null,
        approval: { explicit: true, acknowledgement: "ACTIVATE_JOURNEY" },
      };
      const first = await fetch(`${running.baseUrl}/api/v1/journey/current`, {
        method: "POST",
        headers: {
          ...auth(),
          "content-type": "application/json",
          "idempotency-key": "journey-activation-runtime-key-0001",
        },
        body: JSON.stringify(command),
      });
      assert.equal(first.status, 200);
      const firstBody = await first.json() as Record<string, unknown>;
      assert.equal(firstBody.status, "active");
      assert.equal(firstBody.authorityClass, "DECISION");

      const replay = await fetch(`${running.baseUrl}/api/v1/journey/current`, {
        method: "POST",
        headers: {
          ...auth(),
          "content-type": "application/json",
          "idempotency-key": "journey-activation-runtime-key-0001",
        },
        body: JSON.stringify(command),
      });
      assert.equal(replay.status, 200);
      assert.equal((await replay.json() as Record<string, unknown>).status, "replayed");

      const ownerRead = await fetch(`${running.baseUrl}/api/v1/journey`, { headers: auth() });
      const ownerBody = await ownerRead.json() as {
        current: { name: string; activeCapability: string } | null;
        history: unknown[];
      };
      assert.equal(ownerBody.current?.name, command.name);
      assert.equal(ownerBody.current?.activeCapability, command.activeCapability);
      assert.deepEqual(ownerBody.history, []);

      const otherRead = await fetch(`${running.baseUrl}/api/v1/journey`, { headers: auth("other-token") });
      assert.equal(otherRead.status, 200);
      assert.deepEqual(await otherRead.json(), { current: null, history: [] });

      const stored = await migrationPool.query<{ count: number }>("SELECT count(*)::int AS count FROM journey_decision");
      const events = await migrationPool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM domain_event WHERE event_type = 'JOURNEY_DECISION_ACTIVATED'",
      );
      assert.equal(stored.rows[0]?.count, 1);
      assert.equal(events.rows[0]?.count, 1);
    } finally {
      await running.close();
    }

    const revoked = await revokeJourneyDatabaseRole(migrationPool, roleName);
    assert.equal(revoked.ready, false);
    assert.equal(revoked.requiredPrivileges, false);
    assert.equal(await baseline.check(), true, "revoking Journey must not damage the baseline private contract");
    assert.equal(await journey.check(), false);
  } finally {
    await appPool.end();
  }
});
