import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuntimeProvenance, RuntimeProvenanceError } from "./runtime-provenance";

test("local runtime can be explicitly unversioned", () => {
  assert.deepEqual(resolveRuntimeProvenance({ LIFE_OS_ENVIRONMENT: "local" }), {
    environment: "local",
    releaseSha: "local-unversioned",
    deploymentId: undefined,
    serviceName: undefined,
    platform: "LOCAL",
  });
});

test("Railway Git SHA and deployment metadata are projected without arbitrary environment data", () => {
  const result = resolveRuntimeProvenance({
    LIFE_OS_ENVIRONMENT: "development",
    RAILWAY_GIT_COMMIT_SHA: "abc123",
    RAILWAY_DEPLOYMENT_ID: "deploy-42",
    RAILWAY_SERVICE_ID: "service-id-internal",
    RAILWAY_SERVICE_NAME: "life-os-api",
    DATABASE_URL: "postgresql://secret-user:secret-pass@example.invalid/db",
    SUPABASE_SERVICE_ROLE_KEY: "very-secret",
    OPENAI_API_KEY: "also-secret",
    USER_PRIVATE_NOTE: "never copy this",
  });

  assert.deepEqual(result, {
    environment: "development",
    releaseSha: "abc123",
    deploymentId: "deploy-42",
    serviceName: "life-os-api",
    platform: "RAILWAY",
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("secret-pass"), false);
  assert.equal(serialized.includes("very-secret"), false);
  assert.equal(serialized.includes("also-secret"), false);
  assert.equal(serialized.includes("never copy this"), false);
  assert.equal(serialized.includes("service-id-internal"), false);
});

test("Railway deployment-scoped Git SHA cannot be shadowed by a stale manual release SHA", () => {
  assert.equal(resolveRuntimeProvenance({
    LIFE_OS_ENVIRONMENT: "development",
    LIFE_OS_RELEASE_SHA: "stale-manual-release",
    RAILWAY_GIT_COMMIT_SHA: "actual-railway-release",
    RAILWAY_DEPLOYMENT_ID: "deploy-current",
    RAILWAY_SERVICE_ID: "service-current",
  }).releaseSha, "actual-railway-release");
});

test("explicit Life OS release SHA still overrides incidental platform variables outside Railway", () => {
  assert.equal(resolveRuntimeProvenance({
    LIFE_OS_ENVIRONMENT: "development",
    LIFE_OS_RELEASE_SHA: "explicit-release",
    RAILWAY_GIT_COMMIT_SHA: "incidental-release",
  }).releaseSha, "explicit-release");
});

test("CI may use GitHub SHA without becoming Railway provenance", () => {
  assert.deepEqual(resolveRuntimeProvenance({
    LIFE_OS_ENVIRONMENT: "ci",
    GITHUB_SHA: "ci-sha",
    GITHUB_ACTIONS: "true",
  }), {
    environment: "ci",
    releaseSha: "ci-sha",
    deploymentId: undefined,
    serviceName: undefined,
    platform: "CI",
  });
});

test("non-local environments fail closed when release identity is missing", () => {
  assert.throws(
    () => resolveRuntimeProvenance({ LIFE_OS_ENVIRONMENT: "development" }),
    (error: unknown) => error instanceof RuntimeProvenanceError && /release SHA is required/.test(error.message),
  );
});

test("unknown environment names are rejected", () => {
  assert.throws(
    () => resolveRuntimeProvenance({ LIFE_OS_ENVIRONMENT: "staging-ish", LIFE_OS_RELEASE_SHA: "abc" }),
    (error: unknown) => error instanceof RuntimeProvenanceError && /Unsupported LIFE_OS_ENVIRONMENT/.test(error.message),
  );
});
