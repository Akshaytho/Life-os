import assert from "node:assert/strict";
import test from "node:test";
import {
  WebDeploymentConfigurationError,
  webDeploymentConfigurationFromEnv,
} from "../lib/web-deployment";

function live(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    LIFE_OS_WEB_DEPLOYMENT: "live",
    NEXT_PUBLIC_LIFE_OS_API_BASE_URL: "https://life-os-api.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc123_SAFE-BROWSER_key",
    NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED: "false",
    ...overrides,
  };
}

test("prototype mode remains the default for local/sample development", () => {
  assert.deepEqual(webDeploymentConfigurationFromEnv({}), {
    mode: "prototype",
    directionEnabled: false,
  });
});

test("live mode requires exact HTTPS origins without path, credentials, query or fragment", () => {
  for (const [name, value, code] of [
    ["NEXT_PUBLIC_LIFE_OS_API_BASE_URL", "http://life-os-api.example", "API_ORIGIN_INVALID"],
    ["NEXT_PUBLIC_LIFE_OS_API_BASE_URL", "https://user:pass@life-os-api.example", "API_ORIGIN_INVALID"],
    ["NEXT_PUBLIC_LIFE_OS_API_BASE_URL", "https://life-os-api.example/path", "API_ORIGIN_INVALID"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co/?token=x", "SUPABASE_ORIGIN_INVALID"],
  ] as const) {
    assert.throws(
      () => webDeploymentConfigurationFromEnv(live({ [name]: value })),
      (error: unknown) => error instanceof WebDeploymentConfigurationError && error.code === code,
    );
  }
});

test("live mode fails closed when required public origins or key are absent", () => {
  for (const [name, code] of [
    ["NEXT_PUBLIC_LIFE_OS_API_BASE_URL", "API_ORIGIN_REQUIRED"],
    ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_ORIGIN_REQUIRED"],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY_REQUIRED"],
  ] as const) {
    assert.throws(
      () => webDeploymentConfigurationFromEnv(live({ [name]: "" })),
      (error: unknown) => error instanceof WebDeploymentConfigurationError && error.code === code,
    );
  }
});

test("live mode accepts only Supabase publishable-key material in the browser variable", () => {
  for (const unsafe of [
    "sb_secret_do-not-ship-this",
    "eyJhbGciOiJIUzI1NiJ9.legacy-service-role.jwt",
    "not-a-supabase-public-key",
  ]) {
    assert.throws(
      () => webDeploymentConfigurationFromEnv(live({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: unsafe })),
      (error: unknown) =>
        error instanceof WebDeploymentConfigurationError
        && error.code === "SUPABASE_PUBLISHABLE_KEY_INVALID"
        && !error.message.includes(unsafe),
    );
  }

  const result = webDeploymentConfigurationFromEnv(live());
  assert.equal(result.mode, "live");
  assert.equal(result.apiOrigin, "https://life-os-api.example");
  assert.equal(result.supabaseOrigin, "https://project-ref.supabase.co");
});

test("Direction browser exposure remains an exact separate boolean flag", () => {
  assert.equal(webDeploymentConfigurationFromEnv(live()).directionEnabled, false);
  assert.equal(
    webDeploymentConfigurationFromEnv(live({ NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED: " TRUE " })).directionEnabled,
    true,
  );
  assert.throws(
    () => webDeploymentConfigurationFromEnv(live({ NEXT_PUBLIC_LIFE_OS_DIRECTION_ENABLED: "yes" })),
    (error: unknown) => error instanceof WebDeploymentConfigurationError && error.code === "DIRECTION_FLAG_INVALID",
  );
});

test("invalid deployment mode is rejected rather than silently serving prototype mode", () => {
  assert.throws(
    () => webDeploymentConfigurationFromEnv({ LIFE_OS_WEB_DEPLOYMENT: "production-ish" }),
    (error: unknown) => error instanceof WebDeploymentConfigurationError && error.code === "MODE_INVALID",
  );
});
