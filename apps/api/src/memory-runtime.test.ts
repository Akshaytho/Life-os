import assert from "node:assert/strict";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import { memoryEnabledForRuntime } from "./memory-runtime";

const development = {
  environment: "development" as const,
  releaseSha: "6".repeat(40),
  platform: "LOCAL" as const,
};

const enabled = {
  LIFE_OS_PRIVATE_API_ENABLED: "true",
  LIFE_OS_DIRECTION_ENABLED: "true",
  LIFE_OS_JOURNEY_PRACTICE_ENABLED: "true",
  LIFE_OS_PERIODIC_REVIEWS_ENABLED: "true",
  LIFE_OS_MEMORY_ENABLED: "true",
};

test("Memory is disabled by default and requires exact canonical source flags", () => {
  assert.equal(memoryEnabledForRuntime({}, development), false);
  assert.equal(memoryEnabledForRuntime(enabled, development), true);
  for (const missing of [
    "LIFE_OS_PRIVATE_API_ENABLED",
    "LIFE_OS_DIRECTION_ENABLED",
    "LIFE_OS_JOURNEY_PRACTICE_ENABLED",
    "LIFE_OS_PERIODIC_REVIEWS_ENABLED",
  ]) {
    const value = { ...enabled };
    delete value[missing as keyof typeof value];
    assert.throws(() => memoryEnabledForRuntime(value, development), ApiRuntimeConfigurationError);
  }
});

test("Memory rejects ambiguous flags and requires exact production approval", () => {
  assert.throws(() => memoryEnabledForRuntime({ LIFE_OS_MEMORY_ENABLED: "yes" }, development), ApiRuntimeConfigurationError);
  const production = { ...development, environment: "production" as const };
  assert.throws(() => memoryEnabledForRuntime(enabled, production), ApiRuntimeConfigurationError);
  assert.equal(memoryEnabledForRuntime({
    ...enabled,
    LIFE_OS_PRODUCTION_RELEASE_SHA: development.releaseSha,
  }, production), true);
});
