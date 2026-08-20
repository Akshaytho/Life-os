import assert from "node:assert/strict";
import test from "node:test";
import { productionReleaseApprovedForRuntime } from "./production-release-approval";

const releaseSha = "a".repeat(40);

test("non-production runtimes do not require a production release approval", () => {
  assert.equal(productionReleaseApprovedForRuntime({}, {
    environment: "development",
    releaseSha: "development-release",
    platform: "OTHER",
  }), true);
});

test("production approval requires one exact reviewed 40-character release SHA", () => {
  const production = {
    environment: "production" as const,
    releaseSha,
    platform: "RAILWAY" as const,
  };

  assert.equal(productionReleaseApprovedForRuntime({}, production), false);
  assert.equal(productionReleaseApprovedForRuntime({
    LIFE_OS_PRODUCTION_RELEASE_SHA: "b".repeat(40),
  }, production), false);
  assert.equal(productionReleaseApprovedForRuntime({
    LIFE_OS_PRODUCTION_RELEASE_SHA: "not-a-commit",
  }, production), false);
  assert.equal(productionReleaseApprovedForRuntime({
    LIFE_OS_PRODUCTION_RELEASE_SHA: ` ${releaseSha.toUpperCase()} `,
  }, production), true);
});

test("production approval also refuses an unversioned deployed release", () => {
  assert.equal(productionReleaseApprovedForRuntime({
    LIFE_OS_PRODUCTION_RELEASE_SHA: releaseSha,
  }, {
    environment: "production",
    releaseSha: "latest",
    platform: "OTHER",
  }), false);
});
