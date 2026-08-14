import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HostedPreflightConfigurationError,
  hostedPreflightConfigurationFromEnv,
  runHostedPreflight,
  type PreflightCheckName,
} from "./hosted-preflight";

const BASE_URL = "https://life-os-development.example";
const TOKEN = "synthetic-development-session-token";
const PROBE_ID = "lifeos-preflight-absent-fixed";

interface RecordedRequest {
  method: string;
  path: string;
  authorization: string | undefined;
}

function healthyResponses(path: string, authorization: string | undefined) {
  if (path === "/health/live") return { status: 200, body: { status: "ok" } };
  if (path === "/health/ready") return { status: 200, body: { status: "ready" } };
  if (!authorization) return { status: 401, body: { status: "authentication_required" } };
  if (authorization !== `Bearer ${TOKEN}`) {
    return { status: 401, body: { status: "authentication_required" } };
  }
  return { status: 404, body: { status: "not_found" } };
}

function stubFetch(
  responder: (path: string, authorization: string | undefined) => { status: number; body: unknown },
  recorded: RecordedRequest[] = [],
) {
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const headers = new Headers(init?.headers);
    const authorization = headers.get("authorization") ?? undefined;
    recorded.push({ method: init?.method ?? "GET", path: url.pathname, authorization });
    const { status, body } = responder(url.pathname, authorization);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;

  return { impl, recorded };
}

test("reports READY when every hosted check passes", async () => {
  const { impl } = stubFetch(healthyResponses);

  const report = await runHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  assert.equal(report.status, "READY");
  assert.ok(report.checks.every((check) => check.outcome === "PASSED"));
});

test("issues only read requests and records zero private write attempts", async () => {
  const { impl, recorded } = stubFetch(healthyResponses);

  const report = await runHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  assert.equal(report.privateWriteAttempts, 0);
  assert.equal(recorded.length, report.requestsIssued);
  assert.ok(recorded.every((request) => request.method === "GET"));
  assert.ok(recorded.every((request) => request.path !== "/api/v1/captures"));
  assert.ok(
    recorded.every((request) => !/\/api\/v1\/proposals\/[^/]+\/(apply|reject)$/.test(request.path)),
    "preflight must never touch proposal action routes",
  );
});

test("only ever reads capture identifiers that cannot be real Life OS state", async () => {
  const { impl, recorded } = stubFetch(healthyResponses);

  await runHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  const privatePaths = recorded.filter((request) => request.path.startsWith("/api/v1/"));
  assert.ok(privatePaths.length > 0);
  assert.ok(
    privatePaths.every((request) =>
      request.path.includes(PROBE_ID) || request.path === "/api/v1/there-is-no-such-life-os-route"
    ),
  );
});

test("fails when the private surface accepts an unauthenticated read", async () => {
  const { impl } = stubFetch((path) => {
    if (path === "/health/live") return { status: 200, body: { status: "ok" } };
    if (path === "/health/ready") return { status: 200, body: { status: "ready" } };
    return { status: 404, body: { status: "not_found" } };
  });

  const report = await runHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  assert.equal(report.status, "FAILED");
  const check = report.checks.find((entry) => entry.name === "PRIVATE_REQUIRES_AUTHENTICATION");
  assert.equal(check?.outcome, "FAILED");
});

test("fails when an invalid credential is accepted", async () => {
  const { impl } = stubFetch((path, authorization) => {
    if (path === "/health/live") return { status: 200, body: { status: "ok" } };
    if (path === "/health/ready") return { status: 200, body: { status: "ready" } };
    if (!authorization) return { status: 401, body: { status: "authentication_required" } };
    return { status: 404, body: { status: "not_found" } };
  });

  const report = await runHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  assert.equal(report.status, "FAILED");
  const check = report.checks.find((entry) => entry.name === "PRIVATE_REJECTS_INVALID_CREDENTIAL");
  assert.equal(check?.outcome, "FAILED");
});

test("fails when strict readiness is not ready", async () => {
  const { impl } = stubFetch((path, authorization) => {
    if (path === "/health/ready") return { status: 503, body: { status: "not_ready" } };
    return healthyResponses(path, authorization);
  });

  const report = await runHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  assert.equal(report.status, "FAILED");
  const check = report.checks.find((entry) => entry.name === "HEALTH_READY");
  assert.equal(check?.outcome, "FAILED");
});

test("fails without leaking response detail when the deployment is unreachable", async () => {
  const impl = (async () => {
    throw new Error("connect ECONNREFUSED 10.0.0.1:443");
  }) as unknown as typeof fetch;

  const report = await runHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  assert.equal(report.status, "FAILED");
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes("ECONNREFUSED"));
  assert.ok(!serialized.includes("10.0.0.1"));
});

test("never includes the access token or base URL in the report", async () => {
  const { impl } = stubFetch(healthyResponses);

  const report = await runHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes(TOKEN));
  assert.ok(!serialized.includes(BASE_URL));
});

test("covers the reviewed hosted surface", async () => {
  const { impl } = stubFetch(healthyResponses);

  const report = await runHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  const expected: PreflightCheckName[] = [
    "HEALTH_LIVE",
    "HEALTH_READY",
    "PRIVATE_REQUIRES_AUTHENTICATION",
    "PRIVATE_REJECTS_INVALID_CREDENTIAL",
    "PRIVATE_REVIEW_READ_SCOPED",
    "PRIVATE_TRACE_READ_SCOPED",
    "PRIVATE_UNKNOWN_ROUTE_NOT_FOUND",
  ];

  assert.deepEqual(report.checks.map((check) => check.name), expected);
});

test("requires base URL and access token configuration", () => {
  assert.throws(
    () => hostedPreflightConfigurationFromEnv({ LIFE_OS_PREFLIGHT_ACCESS_TOKEN: TOKEN } as NodeJS.ProcessEnv),
    HostedPreflightConfigurationError,
  );
  assert.throws(
    () => hostedPreflightConfigurationFromEnv({ LIFE_OS_PREFLIGHT_BASE_URL: BASE_URL } as NodeJS.ProcessEnv),
    HostedPreflightConfigurationError,
  );
});

test("rejects a base URL carrying credentials, path, query or fragment", () => {
  for (const baseUrl of [
    "https://user:secret@life-os.example",
    "https://life-os.example/api",
    "https://life-os.example/?token=abc",
    "https://life-os.example/#fragment",
    "not-a-url",
  ]) {
    assert.throws(
      () =>
        hostedPreflightConfigurationFromEnv({
          LIFE_OS_PREFLIGHT_BASE_URL: baseUrl,
          LIFE_OS_PREFLIGHT_ACCESS_TOKEN: TOKEN,
        } as NodeJS.ProcessEnv),
      HostedPreflightConfigurationError,
      `expected ${baseUrl} to be rejected`,
    );
  }
});

test("accepts a normalized project origin", () => {
  const configuration = hostedPreflightConfigurationFromEnv({
    LIFE_OS_PREFLIGHT_BASE_URL: `${BASE_URL}/`,
    LIFE_OS_PREFLIGHT_ACCESS_TOKEN: ` ${TOKEN} `,
  } as NodeJS.ProcessEnv);

  assert.equal(configuration.baseUrl, BASE_URL);
  assert.equal(configuration.accessToken, TOKEN);
});
