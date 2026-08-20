import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { Pool } from "pg";
import { createPrivateDatabaseReadinessProbe } from "./api-runtime";
import {
  ApplicationDbRoleError,
  applyApplicationDatabaseRole,
  planApplicationDatabaseRole,
} from "./application-db-role";
import { applyDatabaseMigrations } from "./migration-runner";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");

const schema = "application_role_provision_test";
const roleName = "lifeos_app_role_it";
const groupRole = "lifeos_app_group_it";
const password = "Synthetic-Application-Database-Password-2026!";
const rotatedPassword = "Synthetic-Rotated-Runtime-Credential-2026!";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const migrationPool = new Pool({
  connectionString: databaseUrl,
  max: 2,
  options: `-c search_path=${schema}`,
});

async function dropFixtureRoles() {
  await adminPool.query(`DROP ROLE IF EXISTS ${groupRole}`);
  await adminPool.query(`DROP ROLE IF EXISTS ${roleName}`);
}

before(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await dropFixtureRoles();
});

beforeEach(async () => {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${groupRole}`);
  await adminPool.query(`DROP ROLE IF EXISTS ${roleName}`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);
});

after(async () => {
  await migrationPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await dropFixtureRoles();
  await adminPool.end();
});

function applicationPool(credential: string = password) {
  const url = new URL(databaseUrl!);
  url.username = roleName;
  url.password = credential;
  return new Pool({
    connectionString: url.toString(),
    max: 2,
    options: `-c search_path=${schema}`,
  });
}

async function assertCredentialRejected(credential: string, message: string) {
  const pool = applicationPool(credential);
  let authenticated = false;
  try {
    await pool.query("SELECT 1");
    authenticated = true;
  } catch {
    authenticated = false;
  } finally {
    await pool.end().catch(() => undefined);
  }
  assert.equal(authenticated, false, message);
}

// Records the SQL the provisioner issues so the existing-role contract can be asserted on any
// PostgreSQL build. A true superuser accepts both the old and new ALTER forms, so attribute state
// alone cannot prove the attribute clause is gone. Quoted literals are redacted before recording
// so a failing assertion can never echo credential material.
function recordingPool(pool: Pool, statements: string[]): Pool {
  const record = (query: unknown) => {
    const text = typeof query === "string" ? query : (query as { text?: string } | null)?.text;
    if (typeof text === "string") statements.push(text.replace(/'(?:[^']|'')*'/g, "'<redacted>'"));
  };
  const bind = (target: object, prop: string | symbol, receiver: unknown) => {
    const value = Reflect.get(target, prop, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  };
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === "query") {
        return (...args: unknown[]) => {
          record(args[0]);
          return (target as Pool).query(...(args as Parameters<Pool["query"]>));
        };
      }
      if (prop === "connect") {
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(clientTarget, clientProp, clientReceiver) {
              if (clientProp === "query") {
                return (...args: unknown[]) => {
                  record(args[0]);
                  return clientTarget.query(...(args as Parameters<typeof clientTarget.query>));
                };
              }
              return bind(clientTarget, clientProp, clientReceiver);
            },
          });
        };
      }
      return bind(target, prop, receiver);
    },
  }) as Pool;
}

async function roleAttributes(): Promise<Record<string, boolean>> {
  const result = await adminPool.query(`
    SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls
    FROM pg_roles WHERE rolname = $1
  `, [roleName]);
  return result.rows[0];
}

test("provisioner requires migrations first, then creates a credential that passes exact runtime readiness", async () => {
  const beforeMigrations = await planApplicationDatabaseRole(migrationPool, roleName);
  assert.equal(beforeMigrations.roleExists, false);
  assert.equal(beforeMigrations.ready, false);
  assert.deepEqual(beforeMigrations.migrationsPending, [
    "0001_write_boundary.sql",
    "0002_capture_routing_proposal.sql",
    "0003_proposal_creation_provenance.sql",
    "0004_row_level_authorization.sql",
    "0005_proposal_rejection_provenance.sql",
    "0006_safe_fallback_interpreter.sql",
    "0007_direction_decision.sql",
    "0008_daily_return_review.sql",
    "0009_brain_dump_not_now.sql",
    "0010_drift_return.sql",
    "0011_journey_activation_practice.sql",
    "0012_periodic_reviews.sql",
  ]);

  await assert.rejects(
    () => applyApplicationDatabaseRole(migrationPool, roleName, password),
    (error: unknown) =>
      error instanceof ApplicationDbRoleError &&
      error.code === "MIGRATIONS_PENDING" &&
      !error.message.includes(password),
  );

  await applyDatabaseMigrations(migrationPool);

  const beforeRole = await planApplicationDatabaseRole(migrationPool, roleName);
  assert.equal(beforeRole.roleExists, false);
  assert.deepEqual(beforeRole.migrationsPending, []);

  const receipt = await applyApplicationDatabaseRole(migrationPool, roleName, password);
  assert.equal(receipt.ready, true);
  assert.equal(receipt.passwordApplied, true);
  assert.equal(receipt.roleAttributesSafe, true);
  assert.equal(receipt.roleMemberships, 0);
  assert.equal(receipt.schemaUsage, true);
  assert.equal(receipt.schemaCreate, false);
  assert.equal(receipt.privateTableCount, 7);
  assert.equal(receipt.protectedTableCount, 7);
  assert.equal(receipt.leastPrivilegeTableCount, 7);
  assert.equal(receipt.userScopeExecute, true);
  assert.equal(receipt.migrationLedgerAccess, false);
  assert.equal(JSON.stringify(receipt).includes(password), false);

  const appPool = applicationPool();
  try {
    assert.equal(await createPrivateDatabaseReadinessProbe(appPool).check(), true);

    const unscoped = await appPool.query("SELECT count(*)::int AS count FROM capture_record");
    assert.equal(unscoped.rows[0].count, 0);

    await assert.rejects(() => appPool.query("CREATE TABLE should_not_exist (id integer)"));
    await assert.rejects(() => appPool.query("SELECT sequence FROM lifeos_schema_migration"));
    await assert.rejects(() => appPool.query("UPDATE lifeos_schema_migration SET applied_at = now()"));
    await assert.rejects(() => appPool.query("SELECT direction_id FROM direction_decision"));
    await assert.rejects(() => appPool.query("SELECT daily_log_entry_id FROM daily_log_entry"));
    await assert.rejects(() => appPool.query("SELECT daily_return_review_id FROM daily_return_review"));

    const forbidden = await appPool.query(`
      SELECT
        has_schema_privilege(current_user, current_schema(), 'CREATE') AS schema_create,
        has_table_privilege(current_user, 'capture_record', 'TRUNCATE') AS can_truncate,
        has_table_privilege(current_user, 'capture_record', 'REFERENCES') AS can_references,
        has_table_privilege(current_user, 'capture_record', 'TRIGGER') AS can_trigger,
        has_table_privilege(current_user, 'direction_decision', 'SELECT') AS can_read_direction,
        has_table_privilege(current_user, 'direction_decision', 'INSERT') AS can_insert_direction,
        has_table_privilege(current_user, 'direction_decision', 'UPDATE') AS can_update_direction,
        has_table_privilege(current_user, 'daily_log_entry', 'SELECT') AS can_read_daily_log,
        has_table_privilege(current_user, 'daily_log_entry', 'INSERT') AS can_insert_daily_log,
        has_table_privilege(current_user, 'daily_return_review', 'SELECT') AS can_read_daily_review,
        has_table_privilege(current_user, 'daily_return_review', 'INSERT') AS can_insert_daily_review,
        has_table_privilege(current_user, 'daily_return_review', 'UPDATE') AS can_update_daily_review
    `);
    assert.deepEqual(forbidden.rows[0], {
      schema_create: false,
      can_truncate: false,
      can_references: false,
      can_trigger: false,
      can_read_direction: false,
      can_insert_direction: false,
      can_update_direction: false,
      can_read_daily_log: false,
      can_insert_daily_log: false,
      can_read_daily_review: false,
      can_insert_daily_review: false,
      can_update_daily_review: false,
    });
  } finally {
    await appPool.end();
  }

  const second = await applyApplicationDatabaseRole(migrationPool, roleName, password);
  assert.equal(second.ready, true);
  assert.equal(second.passwordApplied, true);
});

test("provisioner repairs direct privilege drift that runtime readiness detects", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);

  const appPool = applicationPool();
  try {
    assert.equal(await createPrivateDatabaseReadinessProbe(appPool).check(), true);

    await adminPool.query(`GRANT CREATE ON SCHEMA ${schema} TO ${roleName}`);
    assert.equal(await createPrivateDatabaseReadinessProbe(appPool).check(), false);

    await applyApplicationDatabaseRole(migrationPool, roleName, password);
    assert.equal(await createPrivateDatabaseReadinessProbe(appPool).check(), true);

    await adminPool.query(`GRANT SELECT ON TABLE ${schema}.lifeos_schema_migration TO ${roleName}`);
    assert.equal(await createPrivateDatabaseReadinessProbe(appPool).check(), false);

    await applyApplicationDatabaseRole(migrationPool, roleName, password);
    assert.equal(await createPrivateDatabaseReadinessProbe(appPool).check(), true);

    await adminPool.query(`GRANT TRUNCATE ON TABLE ${schema}.capture_record TO ${roleName}`);
    assert.equal(await createPrivateDatabaseReadinessProbe(appPool).check(), false);

    await applyApplicationDatabaseRole(migrationPool, roleName, password);
    assert.equal(await createPrivateDatabaseReadinessProbe(appPool).check(), true);
  } finally {
    await appPool.end();
  }
});

test("safe existing role can rotate password without rewriting role attributes", async () => {
  await applyDatabaseMigrations(migrationPool);

  const created = await applyApplicationDatabaseRole(migrationPool, roleName, password);
  assert.equal(created.ready, true);

  const beforeRotation = await planApplicationDatabaseRole(migrationPool, roleName);
  assert.equal(beforeRotation.roleExists, true);
  assert.equal(beforeRotation.roleAttributesSafe, true);
  assert.equal(beforeRotation.ready, true);

  const attributesBefore = await roleAttributes();

  const statements: string[] = [];
  const rotated = await applyApplicationDatabaseRole(
    recordingPool(migrationPool, statements),
    roleName,
    rotatedPassword,
  );
  assert.equal(rotated.ready, true);

  const roleStatements = statements.filter((statement) => /\b(CREATE|ALTER)\s+ROLE\b/i.test(statement));
  assert.equal(roleStatements.length, 1, "existing-role rotation must issue exactly one role statement");
  const [rotationStatement] = roleStatements;
  assert.match(
    rotationStatement,
    new RegExp(`ALTER\\s+ROLE\\s+"?${roleName}"?\\s+PASSWORD\\s+'<redacted>'`, "i"),
    "existing-role rotation must be a password-only ALTER",
  );
  for (const attribute of [
    "SUPERUSER",
    "CREATEDB",
    "CREATEROLE",
    "INHERIT",
    "REPLICATION",
    "BYPASSRLS",
    "LOGIN",
  ]) {
    assert.equal(
      new RegExp(`\\b(NO)?${attribute}\\b`, "i").test(rotationStatement),
      false,
      `existing-role rotation must not reassert the ${attribute} attribute`,
    );
  }
  assert.equal(rotated.passwordApplied, true);
  assert.equal(rotated.roleAttributesSafe, true);
  assert.equal(rotated.roleMemberships, 0);
  assert.equal(JSON.stringify(rotated).includes(rotatedPassword), false);

  assert.deepEqual(
    await roleAttributes(),
    attributesBefore,
    "password-only rotation must leave the reviewed role attributes byte-identical",
  );

  const rotatedPool = applicationPool(rotatedPassword);
  try {
    const identity = await rotatedPool.query("SELECT current_user AS connected_role");
    assert.equal(identity.rows[0].connected_role, roleName);

    assert.equal(await createPrivateDatabaseReadinessProbe(rotatedPool).check(), true);

    const unscoped = await rotatedPool.query("SELECT count(*)::int AS count FROM capture_record");
    assert.equal(unscoped.rows[0].count, 0);

    await assert.rejects(() => rotatedPool.query("CREATE TABLE should_not_exist (id integer)"));
    await assert.rejects(() => rotatedPool.query("SELECT sequence FROM lifeos_schema_migration"));
    await assert.rejects(() => rotatedPool.query("SELECT direction_id FROM direction_decision"));

    const forbidden = await rotatedPool.query(`
      SELECT
        has_schema_privilege(current_user, current_schema(), 'CREATE') AS schema_create,
        has_table_privilege(current_user, 'capture_record', 'TRUNCATE') AS can_truncate,
        has_table_privilege(current_user, 'capture_record', 'REFERENCES') AS can_references,
        has_table_privilege(current_user, 'capture_record', 'TRIGGER') AS can_trigger
    `);
    assert.deepEqual(forbidden.rows[0], {
      schema_create: false,
      can_truncate: false,
      can_references: false,
      can_trigger: false,
    });
  } finally {
    await rotatedPool.end();
  }

  await assertCredentialRejected(password, "the superseded credential must stop authenticating");
});

test("unsafe existing role refuses before rotating credentials", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);

  await adminPool.query(`ALTER ROLE ${roleName} INHERIT`);

  const unsafePlan = await planApplicationDatabaseRole(migrationPool, roleName);
  assert.equal(unsafePlan.roleExists, true);
  assert.equal(unsafePlan.roleAttributesSafe, false);
  assert.equal(unsafePlan.ready, false);

  await assert.rejects(
    () => applyApplicationDatabaseRole(migrationPool, roleName, rotatedPassword),
    (error: unknown) =>
      error instanceof ApplicationDbRoleError &&
      error.code === "ROLE_STATE_UNSAFE" &&
      /manual review/.test(error.message) &&
      !error.message.includes(password) &&
      !error.message.includes(rotatedPassword),
  );

  await assertCredentialRejected(
    rotatedPassword,
    "a refused apply must not have installed the new credential",
  );

  const survivingPool = applicationPool(password);
  try {
    const identity = await survivingPool.query("SELECT current_user AS connected_role");
    assert.equal(identity.rows[0].connected_role, roleName, "original credential must still authenticate");
  } finally {
    await survivingPool.end();
  }

  const attributes = await roleAttributes();
  assert.equal(attributes.rolinherit, true, "unsafe attribute must remain for deliberate manual review");
});

test("existing role memberships are treated as manual-review authority and are not silently rewritten", async () => {
  await applyDatabaseMigrations(migrationPool);
  await applyApplicationDatabaseRole(migrationPool, roleName, password);

  await adminPool.query(`CREATE ROLE ${groupRole} NOLOGIN`);
  await adminPool.query(`GRANT ${groupRole} TO ${roleName}`);

  const appPool = applicationPool();
  try {
    assert.equal(await createPrivateDatabaseReadinessProbe(appPool).check(), false);
  } finally {
    await appPool.end();
  }

  await assert.rejects(
    () => applyApplicationDatabaseRole(migrationPool, roleName, password),
    (error: unknown) =>
      error instanceof ApplicationDbRoleError &&
      error.code === "ROLE_STATE_UNSAFE" &&
      /role memberships/.test(error.message) &&
      !error.message.includes(password),
  );

  const memberships = await adminPool.query<{ count: number }>(`
    SELECT count(*)::int AS count
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = $1
  `, [roleName]);
  assert.equal(memberships.rows[0].count, 1, "unsafe membership must remain for deliberate manual review");
});
