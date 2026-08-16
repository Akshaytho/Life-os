import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseSessionVerifier,
  createSupabaseSessionVerifierFromEnv,
  SupabaseSessionVerificationUnavailableError,
  SupabaseSessionVerifierConfigurationError,
  supabaseSessionVerifierConfigurationFromEnv,
} from "./supabase-session-verifier";

function fakeFetch(
  handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return handler as typeof fetch;
}

const trustedUserId = "93aa1c21-7c84-426b-8671-11cd3d9c644f";
const envUserId = "c4bc61e8-8502-40d2-a046-a2856e46bc4e";

test("verifies a Supabase access token through the Auth user endpoint and trusts only the returned canonical user id", async () => {
  const token = "private-user-access-token";
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;

  const verifier = createSupabaseSessionVerifier(
    { supabaseUrl: "https://project-ref.supabase.co/", apiKey: "sb_publishable_example" },
    {
      fetchImpl: fakeFetch(async (input, init) => {
        requestedUrl = String(input);
        requestInit = init;
        return new Response(JSON.stringify({ id: trustedUserId, email: "private@example.test" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    },
  );

  assert.deepEqual(await verifier.verify(token), { userId: trustedUserId });
  assert.equal(requestedUrl, "https://project-ref.supabase.co/auth/v1/user");
  assert.equal(requestedUrl.includes(token), false);
  assert.equal(requestInit?.method, "GET");
  assert.equal(requestInit?.redirect, "error");

  const headers = new Headers(requestInit?.headers);
  assert.equal(headers.get("apikey"), "sb_publishable_example");
  assert.equal(headers.get("authorization"), `Bearer ${token}`);
  assert.equal(headers.get("accept"), "application/json");
});

test("blank credentials are invalid without contacting Supabase", async () => {
  let calls = 0;
  const verifier = createSupabaseSessionVerifier(
    { supabaseUrl: "https://project-ref.supabase.co", apiKey: "publishable-key" },
    {
      fetchImpl: fakeFetch(async () => {
        calls += 1;
        return new Response(null, { status: 500 });
      }),
    },
  );

  assert.equal(await verifier.verify("   "), undefined);
  assert.equal(calls, 0);
});

test("known invalid-session responses are authentication failures rather than provider outages", async () => {
  for (const status of [400, 401, 403]) {
    const verifier = createSupabaseSessionVerifier(
      { supabaseUrl: "https://project-ref.supabase.co", apiKey: "publishable-key" },
      { fetchImpl: fakeFetch(async () => new Response("invalid", { status })) },
    );

    assert.equal(await verifier.verify("expired-or-invalid-token"), undefined);
  }
});

test("rate limits, provider failures and unexpected responses fail as authentication unavailable", async () => {
  for (const status of [404, 408, 429, 500, 503]) {
    const verifier = createSupabaseSessionVerifier(
      { supabaseUrl: "https://project-ref.supabase.co", apiKey: "publishable-key" },
      { fetchImpl: fakeFetch(async () => new Response("provider detail that must stay internal", { status })) },
    );

    await assert.rejects(
      () => verifier.verify("secret-token-value"),
      (error: unknown) =>
        error instanceof SupabaseSessionVerificationUnavailableError &&
        error.message === "Supabase authentication verification unavailable" &&
        !error.message.includes("secret-token-value") &&
        !error.message.includes("provider detail"),
    );
  }
});

test("network failures are sanitized and do not echo token or provider detail", async () => {
  const token = "do-not-log-this-token";
  const verifier = createSupabaseSessionVerifier(
    { supabaseUrl: "https://project-ref.supabase.co", apiKey: "publishable-key" },
    {
      fetchImpl: fakeFetch(async () => {
        throw new Error(`socket failed while checking ${token}`);
      }),
    },
  );

  await assert.rejects(
    () => verifier.verify(token),
    (error: unknown) =>
      error instanceof SupabaseSessionVerificationUnavailableError &&
      !error.message.includes(token) &&
      !error.message.includes("socket failed"),
  );
});

test("a successful HTTP status with malformed or identity-less JSON is not accepted", async () => {
  const responses = [
    new Response("not-json", { status: 200 }),
    new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify({ id: "   " }), { status: 200, headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify({ id: 123 }), { status: 200, headers: { "content-type": "application/json" } }),
  ];

  for (const response of responses) {
    const verifier = createSupabaseSessionVerifier(
      { supabaseUrl: "https://project-ref.supabase.co", apiKey: "publishable-key" },
      { fetchImpl: fakeFetch(async () => response) },
    );

    await assert.rejects(
      () => verifier.verify("apparently-valid-token"),
      (error: unknown) => error instanceof SupabaseSessionVerificationUnavailableError,
    );
  }
});

test("environment configuration prefers a publishable key and supports the legacy anon key fallback", () => {
  assert.deepEqual(
    supabaseSessionVerifierConfigurationFromEnv({
      SUPABASE_URL: "https://project-ref.supabase.co/",
      SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      SUPABASE_ANON_KEY: "legacy-key",
    }),
    { supabaseUrl: "https://project-ref.supabase.co", apiKey: "publishable-key" },
  );

  assert.deepEqual(
    supabaseSessionVerifierConfigurationFromEnv({
      SUPABASE_URL: "https://project-ref.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "   ",
      SUPABASE_ANON_KEY: "legacy-key",
    }),
    { supabaseUrl: "https://project-ref.supabase.co", apiKey: "legacy-key" },
  );
});

test("missing or unsafe provider configuration fails closed without exposing key material", () => {
  assert.throws(
    () => supabaseSessionVerifierConfigurationFromEnv({ SUPABASE_PUBLISHABLE_KEY: "secret-ish-key" }),
    (error: unknown) =>
      error instanceof SupabaseSessionVerifierConfigurationError &&
      error.message === "SUPABASE_URL is required" &&
      !error.message.includes("secret-ish-key"),
  );

  assert.throws(
    () => supabaseSessionVerifierConfigurationFromEnv({ SUPABASE_URL: "https://project-ref.supabase.co" }),
    (error: unknown) =>
      error instanceof SupabaseSessionVerifierConfigurationError &&
      /SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY/.test(error.message),
  );

  for (const value of [
    "not-a-url",
    "ftp://project-ref.supabase.co",
    "https://user:password@project-ref.supabase.co",
    "https://project-ref.supabase.co/auth/v1",
    "https://project-ref.supabase.co?secret=1",
    "https://project-ref.supabase.co#private",
  ]) {
    assert.throws(
      () => supabaseSessionVerifierConfigurationFromEnv({
        SUPABASE_URL: value,
        SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      }),
      (error: unknown) => error instanceof SupabaseSessionVerifierConfigurationError,
    );
  }
});

test("environment factory uses the same verified-session behavior", async () => {
  const verifier = createSupabaseSessionVerifierFromEnv(
    {
      SUPABASE_URL: "https://project-ref.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    },
    {
      fetchImpl: fakeFetch(async () => new Response(JSON.stringify({ id: envUserId }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
    },
  );

  assert.deepEqual(await verifier.verify("env-token"), { userId: envUserId });
});
