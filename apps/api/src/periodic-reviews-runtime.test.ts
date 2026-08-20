import assert from "node:assert/strict";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import { periodicReviewsEnabledForRuntime } from "./periodic-reviews-runtime";

const development = {
  environment: "development" as const,
  releaseSha: "p".repeat(40),
  platform: "LOCAL" as const,
};

test("Periodic Reviews is disabled by default and requires the private API", () => {
  assert.equal(periodicReviewsEnabledForRuntime({}, development), false);
  assert.throws(
    () => periodicReviewsEnabledForRuntime({ LIFE_OS_PERIODIC_REVIEWS_ENABLED: "true" }, development),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError,
  );
  const dependencies = {
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    LIFE_OS_PERIODIC_REVIEWS_ENABLED: "true",
    LIFE_OS_DAILY_RETURN_ENABLED: "true",
    LIFE_OS_BRAIN_DUMP_NOT_NOW_ENABLED: "true",
    LIFE_OS_DRIFT_RETURN_ENABLED: "true",
    LIFE_OS_JOURNEY_PRACTICE_ENABLED: "true",
  };
  assert.equal(periodicReviewsEnabledForRuntime(dependencies, development), true);
});

test("Periodic Reviews rejects ambiguous flags and V1 production activation", () => {
  assert.throws(
    () => periodicReviewsEnabledForRuntime({ LIFE_OS_PERIODIC_REVIEWS_ENABLED: "yes" }, development),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError,
  );
  assert.throws(
    () => periodicReviewsEnabledForRuntime({
      LIFE_OS_PRIVATE_API_ENABLED: "true",
      LIFE_OS_PERIODIC_REVIEWS_ENABLED: "true",
      LIFE_OS_DAILY_RETURN_ENABLED: "true",
      LIFE_OS_BRAIN_DUMP_NOT_NOW_ENABLED: "true",
      LIFE_OS_DRIFT_RETURN_ENABLED: "true",
      LIFE_OS_JOURNEY_PRACTICE_ENABLED: "true",
    }, { ...development, environment: "production" }),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError,
  );
});
