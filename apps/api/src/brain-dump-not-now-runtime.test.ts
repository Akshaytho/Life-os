import assert from "node:assert/strict";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import { brainDumpNotNowEnabledForRuntime } from "./brain-dump-not-now-runtime";

const runtime = {
  environment: "ci" as const,
  releaseSha: "brain-dump-not-now-runtime-test",
  platform: "CI" as const,
};

test("Brain Dump + NOT NOW is independently disabled by default", () => {
  assert.equal(brainDumpNotNowEnabledForRuntime({}, runtime), false);
  assert.equal(brainDumpNotNowEnabledForRuntime({ LIFE_OS_BRAIN_DUMP_NOT_NOW_ENABLED: "false" }, runtime), false);
});

test("Brain Dump + NOT NOW requires the private API and refuses malformed activation", () => {
  assert.throws(
    () => brainDumpNotNowEnabledForRuntime({
      LIFE_OS_BRAIN_DUMP_NOT_NOW_ENABLED: "true",
      LIFE_OS_PRIVATE_API_ENABLED: "false",
    }, runtime),
    (error) => error instanceof ApiRuntimeConfigurationError && /requires/.test(error.message),
  );
  assert.throws(
    () => brainDumpNotNowEnabledForRuntime({ LIFE_OS_BRAIN_DUMP_NOT_NOW_ENABLED: "yes" }, runtime),
    (error) => error instanceof ApiRuntimeConfigurationError && /true or false/.test(error.message),
  );
});

test("reviewed non-production activation requires both explicit flags", () => {
  assert.equal(brainDumpNotNowEnabledForRuntime({
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    LIFE_OS_BRAIN_DUMP_NOT_NOW_ENABLED: "true",
  }, runtime), true);
});
