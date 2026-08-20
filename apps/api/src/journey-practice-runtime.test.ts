import assert from "node:assert/strict";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import { journeyPracticeEnabledForRuntime } from "./journey-practice-runtime";

const development = {
  environment: "ci",
  releaseSha: "journey-practice-test",
  platform: "CI",
} as const;

test("Journey practice stays off by default and requires the private API", () => {
  assert.equal(journeyPracticeEnabledForRuntime({}, development), false);
  assert.equal(
    journeyPracticeEnabledForRuntime({
      LIFE_OS_PRIVATE_API_ENABLED: "true",
      LIFE_OS_JOURNEY_PRACTICE_ENABLED: "true",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      LIFE_OS_ALLOWED_WEB_ORIGIN: "https://life-os.example",
    }, development),
    true,
  );
  assert.throws(
    () => journeyPracticeEnabledForRuntime({
      LIFE_OS_JOURNEY_PRACTICE_ENABLED: "true",
    }, development),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError,
  );
});

test("Journey practice refuses production and malformed flag values", () => {
  assert.throws(
    () => journeyPracticeEnabledForRuntime({
      LIFE_OS_JOURNEY_PRACTICE_ENABLED: "yes",
    }, development),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError,
  );
  assert.throws(
    () => journeyPracticeEnabledForRuntime({
      LIFE_OS_PRIVATE_API_ENABLED: "true",
      LIFE_OS_JOURNEY_PRACTICE_ENABLED: "true",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      LIFE_OS_ALLOWED_WEB_ORIGIN: "https://life-os.example",
    }, { environment: "production", releaseSha: "prod", platform: "RAILWAY" }),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError,
  );
});
