import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiRuntimeConfigurationError,
  createDatabaseReadinessProbe,
  createPrivateDatabaseReadinessProbe,
  databaseUrlForRuntime,
  parsePort,
  privateApiEnabledForRuntime,
} from "./api-runtime";

const developmentRuntime = {
  environment: "development" as const,
  releaseSha: "release-1",
  platform: "OTHER" as const,
};

const productionReleaseSha = "a".repeat(40);
const productionRuntime = {
  environment: "production" as const,
  releaseSha: productionReleaseSha,
  platform: "RAILWAY" as const,
};

const safePrivateRoleRow = {
  role_superuser: false,
  role_bypass_rls: false,
  role_create_db: false,
  role_create_role: false,
  role_replication: false,
  role_inherit: false,
  schema_usage: true,
  schema_create: false,
  role_memberships: 0,
  table_count: 7,
  safe_table_count: 7,
  least_privilege_table_count: 7,
};

const safeUnscopedRow = {
  user_id: null,
  visible_capture_rows: 0,
  migration_ledger_access: false,
};

test("PORT defaults locally and accepts Railway-style injected values", () => {
  assert.equal(parsePort(undefined), 4000);
  assert.equal(parsePort("8080"), 8080);
});

test("invalid ports fail before server startup", () => {
  for (const value of ["0", "65536", "abc", "80.5", "-1"]) {
    assert.throws(
      () => parsePort(value),
      (error: unknown) => error instanceof ApiRuntimeConfigurationError && /PORT must be/.test(error.message),
    );
  }
});

test("local health-only runtime may start without a database", () => {
  assert.equal(databaseUrlForRuntime({ LIFE_OS_ENVIRONMENT: "local" }), undefined);
});

test("hosted development fails closed without DATABASE_URL and release identity", () => {
  assert.throws(
    () => databaseUrlForRuntime({ LIFE_OS_ENVIRONMENT: "development", LIFE_OS_RELEASE_SHA: "release-1" }),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError && /DATABASE_URL is required/.test(error.message),
  );
});

test("hosted development accepts server-only DATABASE_URL without returning it from config helper", () => {
  const url = "postgresql://user:secret@example.invalid/lifeos";
  assert.equal(databaseUrlForRuntime({
    LIFE_OS_ENVIRONMENT: "development",
    LIFE_OS_RELEASE_SHA: "release-1",
    DATABASE_URL: url,
  }), url);
});

test("private API is opt-in and accepts only explicit true/false", () => {
  assert.equal(privateApiEnabledForRuntime({}, { environment: "local", releaseSha: "local", platform: "LOCAL" }), false);
  assert.equal(privateApiEnabledForRuntime({ LIFE_OS_PRIVATE_API_ENABLED: "false" }, developmentRuntime), false);
  assert.equal(privateApiEnabledForRuntime({ LIFE_OS_PRIVATE_API_ENABLED: " TRUE " }, developmentRuntime), true);

  for (const value of ["1", "yes", "enabled", "on"]) {
    assert.throws(
      () => privateApiEnabledForRuntime({ LIFE_OS_PRIVATE_API_ENABLED: value }, developmentRuntime),
      (error: unknown) => error instanceof ApiRuntimeConfigurationError && /must be true or false/.test(error.message),
    );
  }
});

test("private API production activation refuses an absent or stale release approval", () => {
  assert.throws(
    () => privateApiEnabledForRuntime(
      { LIFE_OS_PRIVATE_API_ENABLED: "true" },
      productionRuntime,
    ),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError && /PRODUCTION_RELEASE_SHA/.test(error.message),
  );
  assert.throws(() => privateApiEnabledForRuntime({
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    LIFE_OS_PRODUCTION_RELEASE_SHA: "b".repeat(40),
  }, productionRuntime), ApiRuntimeConfigurationError);
});

test("private API production activation accepts only the exact reviewed release", () => {
  assert.equal(privateApiEnabledForRuntime({
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    LIFE_OS_PRODUCTION_RELEASE_SHA: productionReleaseSha,
  }, productionRuntime), true);
});

test("database readiness issues only a constant SELECT 1 and returns ready", async () => {
  const queries: string[] = [];
  const probe = createDatabaseReadinessProbe({
    async query(text) {
      queries.push(text);
      return { rows: [{ "?column?": 1 }] };
    },
  });

  assert.equal(await probe.check(), true);
  assert.deepEqual(queries, ["SELECT 1"]);
});

test("local no-database readiness is healthy for the health-only transport", async () => {
  assert.equal(await createDatabaseReadinessProbe(undefined).check(), true);
});

test("private readiness proves exact least-privilege role, FORCE RLS and empty unscoped visibility", async () => {
  const queries: string[] = [];
  const probe = createPrivateDatabaseReadinessProbe({
    async query(text) {
      queries.push(text);
      return { rows: [queries.length === 1 ? safePrivateRoleRow : safeUnscopedRow] };
    },
  });

  assert.equal(await probe.check(), true);
  assert.equal(queries.length, 2);
  for (const table of [
    "capture_record",
    "routing_interpretation",
    "routing_proposal",
    "calendar_event",
    "domain_event",
    "applied_proposal",
    "proposal_rejection",
  ]) {
    assert.equal(queries[0].includes(table), true);
  }
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
    assert.equal(queries[0].includes(privilege), true);
  }
  assert.equal(queries[0].includes("has_schema_privilege"), true);
  assert.equal(queries[0].includes("pg_auth_members"), true);
  assert.equal(queries[1].includes("lifeos_current_user_id()"), true);
  assert.equal(queries[1].includes("lifeos_schema_migration"), true);
});

test("private readiness rejects elevated role attributes, memberships, schema authority or incomplete table grants", async () => {
  const unsafeRoleRows = [
    { ...safePrivateRoleRow, role_superuser: true },
    { ...safePrivateRoleRow, role_bypass_rls: true },
    { ...safePrivateRoleRow, role_create_db: true },
    { ...safePrivateRoleRow, role_create_role: true },
    { ...safePrivateRoleRow, role_replication: true },
    { ...safePrivateRoleRow, role_inherit: true },
    { ...safePrivateRoleRow, role_memberships: 1 },
    { ...safePrivateRoleRow, schema_usage: false },
    { ...safePrivateRoleRow, schema_create: true },
    { ...safePrivateRoleRow, table_count: 6, safe_table_count: 6, least_privilege_table_count: 6 },
    { ...safePrivateRoleRow, safe_table_count: 6 },
    { ...safePrivateRoleRow, least_privilege_table_count: 6 },
  ];

  for (const row of unsafeRoleRows) {
    let calls = 0;
    const probe = createPrivateDatabaseReadinessProbe({
      async query() {
        calls += 1;
        return { rows: [row] };
      },
    });
    assert.equal(await probe.check(), false);
    assert.equal(calls, 1);
  }
});

test("private readiness rejects leaked user scope, visible private rows or migration-ledger authority", async () => {
  for (const unscoped of [
    { ...safeUnscopedRow, user_id: "unexpected-user" },
    { ...safeUnscopedRow, visible_capture_rows: 1 },
    { ...safeUnscopedRow, migration_ledger_access: true },
  ]) {
    let calls = 0;
    const probe = createPrivateDatabaseReadinessProbe({
      async query() {
        calls += 1;
        return { rows: [calls === 1 ? safePrivateRoleRow : unscoped] };
      },
    });
    assert.equal(await probe.check(), false);
    assert.equal(calls, 2);
  }
});
