import assert from "node:assert/strict";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import { memoryEnabledForRuntime } from "./memory-runtime";

const development = {
  environment: "development" as const,
  releaseSha: "m".repeat(40),
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

test("Memory rejects ambiguous flags and V1 production activation", () => {
  assert.throws(() => memoryEnabledForRuntime({ LIFE_OS_MEMORY_ENABLED: "yes" }, development), ApiRuntimeConfigurationError);
  assert.throws(
    () => memoryEnabledForRuntime(enabled, { ...development, environment: "production" }),
    ApiRuntimeConfigurationError,
  );
});
