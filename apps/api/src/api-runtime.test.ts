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

test("private API V1 refuses production activation even when credentials exist", () => {
  assert.throws(
    () => privateApiEnabledForRuntime(
      { LIFE_OS_PRIVATE_API_ENABLED: "true" },
      { environment: "production", releaseSha: "prod-release", platform: "OTHER" },
    ),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError && /cannot be activated in production/.test(error.message),
  );
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

test("private readiness proves least-privileged role, FORCE RLS and empty unscoped user visibility", async () => {
  const queries: string[] = [];
  const probe = createPrivateDatabaseReadinessProbe({
    async query(text) {
      queries.push(text);
      if (queries.length === 1) {
        return {
          rows: [{
            role_superuser: false,
            role_bypass_rls: false,
            table_count: 7,
            safe_table_count: 7,
          }],
        };
      }
      return { rows: [{ user_id: null, visible_capture_rows: 0 }] };
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
  assert.equal(queries[1].includes("lifeos_current_user_id()"), true);
});

test("private readiness rejects elevated, incomplete, owner-like or user-scoped database connections", async () => {
  const unsafeRoleRows = [
    { role_superuser: true, role_bypass_rls: false, table_count: 7, safe_table_count: 7 },
    { role_superuser: false, role_bypass_rls: true, table_count: 7, safe_table_count: 7 },
    { role_superuser: false, role_bypass_rls: false, table_count: 6, safe_table_count: 6 },
    { role_superuser: false, role_bypass_rls: false, table_count: 7, safe_table_count: 6 },
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

  for (const unscoped of [
    { user_id: "unexpected-user", visible_capture_rows: 0 },
    { user_id: null, visible_capture_rows: 1 },
  ]) {
    let calls = 0;
    const probe = createPrivateDatabaseReadinessProbe({
      async query() {
        calls += 1;
        if (calls === 1) {
          return {
            rows: [{
              role_superuser: false,
              role_bypass_rls: false,
              table_count: 7,
              safe_table_count: 7,
            }],
          };
        }
        return { rows: [unscoped] };
      },
    });
    assert.equal(await probe.check(), false);
    assert.equal(calls, 2);
  }
});
