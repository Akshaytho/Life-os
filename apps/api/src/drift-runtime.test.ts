import assert from "node:assert/strict";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import { driftEnabledForRuntime } from "./drift-runtime";

const runtime = {
  environment: "ci" as const,
  releaseSha: "drift-runtime-test",
  platform: "CI" as const,
};

test("Drift + Return is independently disabled by default", () => {
  assert.equal(driftEnabledForRuntime({}, runtime), false);
  assert.equal(driftEnabledForRuntime({ LIFE_OS_DRIFT_RETURN_ENABLED: "false" }, runtime), false);
});

test("Drift + Return requires the private API and rejects malformed activation", () => {
  assert.throws(
    () => driftEnabledForRuntime({
      LIFE_OS_DRIFT_RETURN_ENABLED: "true",
      LIFE_OS_PRIVATE_API_ENABLED: "false",
    }, runtime),
    (error) => error instanceof ApiRuntimeConfigurationError && /requires/.test(error.message),
  );
  assert.throws(
    () => driftEnabledForRuntime({ LIFE_OS_DRIFT_RETURN_ENABLED: "yes" }, runtime),
    (error) => error instanceof ApiRuntimeConfigurationError && /true or false/.test(error.message),
  );
});

test("reviewed non-production Drift activation requires both explicit flags", () => {
  assert.equal(driftEnabledForRuntime({
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    LIFE_OS_DRIFT_RETURN_ENABLED: "true",
  }, runtime), true);
});

test("Drift production activation requires the exact private release approval", () => {
  const releaseSha = "f".repeat(40);
  const production = { environment: "production" as const, releaseSha, platform: "RAILWAY" as const };
  assert.throws(() => driftEnabledForRuntime({
      LIFE_OS_PRIVATE_API_ENABLED: "true",
      LIFE_OS_DRIFT_RETURN_ENABLED: "true",
    }, production), ApiRuntimeConfigurationError);
  assert.equal(driftEnabledForRuntime({
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    LIFE_OS_DRIFT_RETURN_ENABLED: "true",
    LIFE_OS_PRODUCTION_RELEASE_SHA: releaseSha,
  }, production), true);
});
