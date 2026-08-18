import assert from "node:assert/strict";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import { journeyEnabledForRuntime } from "./journey-runtime";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    LIFE_OS_ENVIRONMENT: "development",
    LIFE_OS_RELEASE_SHA: "journey-runtime-test",
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    ...overrides,
  };
}

test("Journey runtime is disabled by default and when explicitly false", () => {
  assert.equal(journeyEnabledForRuntime(env({ LIFE_OS_JOURNEY_ENABLED: undefined })), false);
  assert.equal(journeyEnabledForRuntime(env({ LIFE_OS_JOURNEY_ENABLED: "false" })), false);
  assert.equal(journeyEnabledForRuntime(env({ LIFE_OS_JOURNEY_ENABLED: " FALSE " })), false);
});

test("Journey runtime requires an exact true/false value", () => {
  assert.throws(
    () => journeyEnabledForRuntime(env({ LIFE_OS_JOURNEY_ENABLED: "yes" })),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError && /must be true or false/.test(error.message),
  );
});

test("Journey runtime cannot activate without the private API boundary", () => {
  assert.throws(
    () => journeyEnabledForRuntime(env({ LIFE_OS_PRIVATE_API_ENABLED: "false", LIFE_OS_JOURNEY_ENABLED: "true" })),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError && /requires LIFE_OS_PRIVATE_API_ENABLED=true/.test(error.message),
  );
});

test("Journey runtime can be explicitly enabled in development", () => {
  assert.equal(journeyEnabledForRuntime(env({ LIFE_OS_JOURNEY_ENABLED: "true" })), true);
});

test("Journey runtime remains blocked in production", () => {
  assert.throws(
    () => journeyEnabledForRuntime({
      LIFE_OS_ENVIRONMENT: "production",
      LIFE_OS_RELEASE_SHA: "journey-runtime-test",
      LIFE_OS_PRIVATE_API_ENABLED: "true",
      LIFE_OS_JOURNEY_ENABLED: "true",
    }),
    ApiRuntimeConfigurationError,
  );
});
