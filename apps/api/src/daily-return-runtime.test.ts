import assert from "node:assert/strict";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import { dailyReturnEnabledForRuntime } from "./daily-return-runtime";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    LIFE_OS_ENVIRONMENT: "development",
    LIFE_OS_RELEASE_SHA: "daily-return-runtime-test",
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    ...overrides,
  };
}

test("Daily Return runtime is disabled by default and when explicitly false", () => {
  assert.equal(
    dailyReturnEnabledForRuntime(env({ LIFE_OS_DAILY_RETURN_ENABLED: undefined })),
    false,
  );
  assert.equal(
    dailyReturnEnabledForRuntime(env({ LIFE_OS_DAILY_RETURN_ENABLED: "false" })),
    false,
  );
  assert.equal(
    dailyReturnEnabledForRuntime(env({ LIFE_OS_DAILY_RETURN_ENABLED: " FALSE " })),
    false,
  );
});

test("Daily Return runtime requires an exact true/false value", () => {
  assert.throws(
    () => dailyReturnEnabledForRuntime(env({ LIFE_OS_DAILY_RETURN_ENABLED: "yes" })),
    (error: unknown) =>
      error instanceof ApiRuntimeConfigurationError
      && /must be true or false/.test(error.message),
  );
});

test("Daily Return cannot activate without the private API boundary", () => {
  assert.throws(
    () => dailyReturnEnabledForRuntime(env({
      LIFE_OS_PRIVATE_API_ENABLED: "false",
      LIFE_OS_DAILY_RETURN_ENABLED: "true",
    })),
    (error: unknown) =>
      error instanceof ApiRuntimeConfigurationError
      && /requires LIFE_OS_PRIVATE_API_ENABLED=true/.test(error.message),
  );
});

test("Daily Return can be explicitly enabled in development", () => {
  assert.equal(
    dailyReturnEnabledForRuntime(env({ LIFE_OS_DAILY_RETURN_ENABLED: "true" })),
    true,
  );
});

test("Daily Return production activation inherits the exact private release approval", () => {
  const releaseSha = "e".repeat(40);
  const production = {
    environment: "production" as const,
    releaseSha,
    platform: "RAILWAY" as const,
  };
  assert.throws(() => dailyReturnEnabledForRuntime({
      LIFE_OS_PRIVATE_API_ENABLED: "true",
      LIFE_OS_DAILY_RETURN_ENABLED: "true",
    }, production), ApiRuntimeConfigurationError);
  assert.equal(dailyReturnEnabledForRuntime({
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    LIFE_OS_DAILY_RETURN_ENABLED: "true",
    LIFE_OS_PRODUCTION_RELEASE_SHA: releaseSha,
  }, production), true);
});
