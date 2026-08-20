import assert from "node:assert/strict";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import { directionEnabledForRuntime } from "./direction-runtime";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    LIFE_OS_ENVIRONMENT: "development",
    LIFE_OS_RELEASE_SHA: "direction-runtime-test",
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    ...overrides,
  };
}

test("Direction runtime is disabled by default and when explicitly false", () => {
  assert.equal(directionEnabledForRuntime(env({ LIFE_OS_DIRECTION_ENABLED: undefined })), false);
  assert.equal(directionEnabledForRuntime(env({ LIFE_OS_DIRECTION_ENABLED: "false" })), false);
  assert.equal(directionEnabledForRuntime(env({ LIFE_OS_DIRECTION_ENABLED: " FALSE " })), false);
});

test("Direction runtime requires an exact true/false value", () => {
  assert.throws(
    () => directionEnabledForRuntime(env({ LIFE_OS_DIRECTION_ENABLED: "yes" })),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError && /must be true or false/.test(error.message),
  );
});

test("Direction runtime cannot activate without the reviewed private API boundary", () => {
  assert.throws(
    () => directionEnabledForRuntime(env({ LIFE_OS_PRIVATE_API_ENABLED: "false", LIFE_OS_DIRECTION_ENABLED: "true" })),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError && /requires LIFE_OS_PRIVATE_API_ENABLED=true/.test(error.message),
  );
});

test("Direction runtime can be explicitly enabled in development", () => {
  assert.equal(directionEnabledForRuntime(env({ LIFE_OS_DIRECTION_ENABLED: "true" })), true);
});

test("Direction production activation inherits the exact private release approval", () => {
  const releaseSha = "d".repeat(40);
  const production = {
    environment: "production" as const,
    releaseSha,
    platform: "RAILWAY" as const,
  };
  assert.throws(() => directionEnabledForRuntime({
      LIFE_OS_ENVIRONMENT: "production",
      LIFE_OS_PRIVATE_API_ENABLED: "true",
      LIFE_OS_DIRECTION_ENABLED: "true",
    }, production), ApiRuntimeConfigurationError);
  assert.equal(directionEnabledForRuntime({
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    LIFE_OS_DIRECTION_ENABLED: "true",
    LIFE_OS_PRODUCTION_RELEASE_SHA: releaseSha,
  }, production), true);
});
