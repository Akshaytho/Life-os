import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { applyDatabaseMigrations, planDatabaseMigrations } from "./migration-runner";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "migration_ledger_security_test";
const restrictedRoleNames = ["anon", "authenticated", "service_role"] as const;
const createdRoles: string[] = [];

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const migrationPool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  options: `-c search_path=${schema}`,
});

interface LedgerSecurityState {
  rls_enabled: boolean;
  rls_forced: boolean;
  restricted_acl_entries: number;
  policy_count: number;
}

async function ledgerSecurityState(): Promise<LedgerSecurityState> {
  const result = await adminPool.query<LedgerSecurityState>(`
    SELECT
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      (
        SELECT count(*)::int
        FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE acl.grantee = 0
           OR grantee.rolname = ANY($1::text[])
      ) AS restricted_acl_entries,
      (
        SELECT count(*)::int
        FROM pg_policy policy
        WHERE policy.polrelid = c.oid
      ) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $2
      AND c.relname = 'lifeos_schema_migration'
  `, [restrictedRoleNames, schema]);

  assert.equal(result.rows.length, 1, "migration ledger must exist");
  return result.rows[0];
}

before(async () => {
  for (const roleName of restrictedRoleNames) {
    const exists = await adminPool.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
      [roleName],
    );
    if (!exists.rows[0]?.exists) {
      await adminPool.query(`CREATE ROLE ${roleName} NOLOGIN`);
      createdRoles.push(roleName);
    }
  }
});

beforeEach(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);
});

after(async () => {
  await migrationPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  for (const roleName of createdRoles.reverse()) {
    await adminPool.query(`DROP ROLE ${roleName}`);
  }
  await adminPool.end();
});

test("migration apply keeps the ledger admin-only and repairs API-role drift even with zero pending migrations", async () => {
  const first = await applyDatabaseMigrations(migrationPool);
  assert.equal(first.appliedNow.length, 14);
  assert.deepEqual(first.pending, []);

  assert.deepEqual(await ledgerSecurityState(), {
    rls_enabled: true,
    rls_forced: false,
    restricted_acl_entries: 0,
    policy_count: 0,
  });

  await adminPool.query(`ALTER TABLE ${schema}.lifeos_schema_migration DISABLE ROW LEVEL SECURITY`);
  await adminPool.query(`GRANT SELECT ON TABLE ${schema}.lifeos_schema_migration TO PUBLIC`);
  for (const roleName of restrictedRoleNames) {
    await adminPool.query(`GRANT ALL PRIVILEGES ON TABLE ${schema}.lifeos_schema_migration TO ${roleName}`);
  }

  const drifted = await ledgerSecurityState();
  assert.equal(drifted.rls_enabled, false);
  assert.ok(drifted.restricted_acl_entries > 0);

  const plan = await planDatabaseMigrations(migrationPool);
  assert.equal(plan.pending.length, 0);

  const afterPlan = await ledgerSecurityState();
  assert.equal(afterPlan.rls_enabled, false, "plan mode must not repair security drift");
  assert.ok(afterPlan.restricted_acl_entries > 0, "plan mode must remain read-only");

  const repaired = await applyDatabaseMigrations(migrationPool);
  assert.deepEqual(repaired.appliedNow, []);
  assert.deepEqual(repaired.pending, []);

  assert.deepEqual(await ledgerSecurityState(), {
    rls_enabled: true,
    rls_forced: false,
    restricted_acl_entries: 0,
    policy_count: 0,
  });

  const history = await migrationPool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM lifeos_schema_migration",
  );
  assert.equal(history.rows[0].count, 14, "hardening must not rewrite migration history");
});
