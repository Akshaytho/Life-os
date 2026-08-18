import assert from "node:assert/strict";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import {
  aiRetrievalEnabledForRuntime,
  createLifeOsAssistantFromEnv,
} from "./ai-retrieval-runtime";

const provenance = {
  environment: "development" as const,
  releaseSha: "a".repeat(40),
  platform: "LOCAL" as const,
};

test("an API key does not silently enable Ask Life OS retrieval", () => {
  const env = { OPENAI_API_KEY: "present-but-dormant" } as NodeJS.ProcessEnv;
  assert.equal(aiRetrievalEnabledForRuntime(env, provenance), false);
  assert.equal(createLifeOsAssistantFromEnv(env, provenance), undefined);
});

test("retrieval activation requires the private API, explicit model, and server key", () => {
  assert.throws(
    () => aiRetrievalEnabledForRuntime({ LIFE_OS_AI_RETRIEVAL_ENABLED: "true" } as NodeJS.ProcessEnv, provenance),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError,
  );
  const base = {
    LIFE_OS_PRIVATE_API_ENABLED: "true",
    LIFE_OS_AI_RETRIEVAL_ENABLED: "true",
    LIFE_OS_ENVIRONMENT: "development",
    LIFE_OS_RELEASE_SHA: "a".repeat(40),
  } as NodeJS.ProcessEnv;
  assert.throws(
    () => createLifeOsAssistantFromEnv(base, provenance),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError,
  );
  assert.throws(
    () => createLifeOsAssistantFromEnv({ ...base, OPENAI_API_KEY: "key" }, provenance),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError,
  );
  assert.ok(createLifeOsAssistantFromEnv({
    ...base,
    OPENAI_API_KEY: "key",
    LIFE_OS_AI_RETRIEVAL_MODEL: "reviewed-model",
  }, provenance));
});

test("invalid retrieval activation values fail closed", () => {
  assert.throws(
    () => aiRetrievalEnabledForRuntime({ LIFE_OS_AI_RETRIEVAL_ENABLED: "yes" } as NodeJS.ProcessEnv, provenance),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError,
  );
});
