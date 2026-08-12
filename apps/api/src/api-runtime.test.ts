import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiRuntimeConfigurationError,
  createDatabaseReadinessProbe,
  databaseUrlForRuntime,
  parsePort,
} from "./api-runtime";

test("PORT defaults locally and accepts Railway-style injected values", () => {
  assert.equal(parsePort(undefined), 4000);
  assert.equal(parsePort("8080"), 8080);
});

test("invalid ports fail before server startup", () => {
  for (const value of ["0", "65536", "abc", "80.5", "-1"]) {
    assert.throws(
      () => parsePort(value),
      (error: unknown) => error instanceof ApiRuntimeConfigurationError && /PORT must be/.test(error.message),
    );
  }
});

test("local health-only runtime may start without a database", () => {
  assert.equal(databaseUrlForRuntime({ LIFE_OS_ENVIRONMENT: "local" }), undefined);
});

test("hosted development fails closed without DATABASE_URL and release identity", () => {
  assert.throws(
    () => databaseUrlForRuntime({ LIFE_OS_ENVIRONMENT: "development", LIFE_OS_RELEASE_SHA: "release-1" }),
    (error: unknown) => error instanceof ApiRuntimeConfigurationError && /DATABASE_URL is required/.test(error.message),
  );
});

test("hosted development accepts server-only DATABASE_URL without returning it from config helper", () => {
  const url = "postgresql://user:secret@example.invalid/lifeos";
  assert.equal(databaseUrlForRuntime({
    LIFE_OS_ENVIRONMENT: "development",
    LIFE_OS_RELEASE_SHA: "release-1",
    DATABASE_URL: url,
  }), url);
});

test("database readiness issues only a constant SELECT 1 and returns ready", async () => {
  const queries: string[] = [];
  const probe = createDatabaseReadinessProbe({
    async query(text) {
      queries.push(text);
      return { rows: [{ "?column?": 1 }] };
    },
  });

  assert.equal(await probe.check(), true);
  assert.deepEqual(queries, ["SELECT 1"]);
});

test("local no-database readiness is healthy for the health-only transport", async () => {
  assert.equal(await createDatabaseReadinessProbe(undefined).check(), true);
});
