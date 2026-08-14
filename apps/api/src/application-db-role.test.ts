import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplicationDbRoleError,
  applicationDbRoleApplyConfigurationFromEnv,
  applicationDbRolePlanConfigurationFromEnv,
} from "./application-db-role";

const migrationUrl = "postgresql://migration-admin:private@example.invalid/lifeos";
const applicationUrl = "postgresql://lifeos_app:other@example.invalid/lifeos";

function developmentEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    LIFE_OS_ENVIRONMENT: "development",
    LIFE_OS_RELEASE_SHA: "release-1",
    MIGRATION_DATABASE_URL: migrationUrl,
    DATABASE_URL: applicationUrl,
    ...overrides,
  };
}

test("plan configuration defaults to the dedicated Life OS application role without requiring a password", () => {
  assert.deepEqual(applicationDbRolePlanConfigurationFromEnv(developmentEnv()), {
    migrationDatabaseUrl: migrationUrl,
    environment: "development",
    roleName: "lifeos_app",
  });
});

test("explicit application role names must remain narrow and cannot reuse managed roles", () => {
  assert.equal(
    applicationDbRolePlanConfigurationFromEnv(developmentEnv({ LIFE_OS_APPLICATION_DB_ROLE: "lifeos_runtime" })).roleName,
    "lifeos_runtime",
  );

  for (const roleName of [
    "postgres",
    "anon",
    "authenticated",
    "authenticator",
    "service_role",
    "pg_monitor",
    "supabase_admin",
    "LifeOs_App",
    "lifeos-app",
    "ab",
    "1lifeos",
  ]) {
    assert.throws(
      () => applicationDbRolePlanConfigurationFromEnv(developmentEnv({ LIFE_OS_APPLICATION_DB_ROLE: roleName })),
      (error: unknown) =>
        error instanceof ApplicationDbRoleError &&
        error.code === "CONFIGURATION_INVALID" &&
        !error.message.includes(migrationUrl),
    );
  }
});

test("apply configuration requires a strong-enough synthetic password without echoing it", () => {
  const password = "Synthetic-Only-Database-Password-2026!";
  assert.deepEqual(
    applicationDbRoleApplyConfigurationFromEnv(developmentEnv({ LIFE_OS_APPLICATION_DB_PASSWORD: password })),
    {
      migrationDatabaseUrl: migrationUrl,
      environment: "development",
      roleName: "lifeos_app",
      password,
    },
  );

  for (const badPassword of [
    "short",
    "lifeos_app-is-not-allowed-as-password-2026!",
    "Synthetic-password-with-control\ncharacter-2026!",
  ]) {
    assert.throws(
      () => applicationDbRoleApplyConfigurationFromEnv(developmentEnv({ LIFE_OS_APPLICATION_DB_PASSWORD: badPassword })),
      (error: unknown) =>
        error instanceof ApplicationDbRoleError &&
        error.code === "CONFIGURATION_INVALID" &&
        !error.message.includes(badPassword),
    );
  }
});

test("production provisioning is refused through the shared migration environment boundary", () => {
  assert.throws(
    () => applicationDbRolePlanConfigurationFromEnv({
      LIFE_OS_ENVIRONMENT: "production",
      LIFE_OS_RELEASE_SHA: "prod-release",
      MIGRATION_DATABASE_URL: migrationUrl,
    }),
    (error: unknown) =>
      error instanceof Error &&
      /refuses production/.test(error.message) &&
      !error.message.includes("private"),
  );
});
