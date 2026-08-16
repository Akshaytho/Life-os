import assert from "node:assert/strict";
import test from "node:test";
import {
  runWebHostedPreflight,
  webHostedPreflightConfigurationFromEnv,
  WebHostedPreflightConfigurationError,
} from "./hosted-preflight";

const BASE_URL = "https://life-os-web.example";

function privacyHeaders() {
  return {
    "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
}

function stubFetch(
  responder: (path: string) => { status: number; body: string; headers?: Record<string, string> },
  recorded: Array<{ method: string; path: string }> = [],
) {
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    recorded.push({ method: init?.method ?? "GET", path: url.pathname });
    const result = responder(url.pathname);
    return new Response(result.body, { status: result.status, headers: result.headers });
  }) as unknown as typeof fetch;
  return { impl, recorded };
}

function healthy(path: string) {
  if (path === "/health/live") {
    return { status: 200, body: JSON.stringify({ status: "ok" }), headers: { "content-type": "application/json" } };
  }
  if (path === "/health/ready") {
    return {
      status: 200,
      body: JSON.stringify({ status: "ready", mode: "live", direction: "dormant" }),
      headers: { "content-type": "application/json" },
    };
  }
  if (path === "/capture") {
    return { status: 200, body: "<html><body>Life OS</body></html>", headers: privacyHeaders() };
  }
  if (path === "/robots.txt") {
    return { status: 200, body: "User-Agent: *\nDisallow: /\n", headers: { "content-type": "text/plain" } };
  }
  return { status: 404, body: "not found" };
}

test("reports READY using only four GET requests", async () => {
  const { impl, recorded } = stubFetch(healthy);
  const report = await runWebHostedPreflight(
    { baseUrl: BASE_URL, expectedDirection: "dormant" },
    { fetchImpl: impl },
  );

  assert.equal(report.status, "READY");
  assert.equal(report.requestsIssued, 4);
  assert.equal(report.writeAttempts, 0);
  assert.ok(recorded.every((request) => request.method === "GET"));
  assert.deepEqual(recorded.map((request) => request.path), [
    "/health/live",
    "/health/ready",
    "/capture",
    "/robots.txt",
  ]);
});

test("fails if readiness is not explicit live mode", async () => {
  const { impl } = stubFetch((path) => {
    if (path === "/health/ready") {
      return {
        status: 503,
        body: JSON.stringify({ status: "not_ready", reason: "live_mode_required" }),
        headers: { "content-type": "application/json" },
      };
    }
    return healthy(path);
  });

  const report = await runWebHostedPreflight(
    { baseUrl: BASE_URL, expectedDirection: "dormant" },
    { fetchImpl: impl },
  );
  assert.equal(report.status, "FAILED");
  assert.equal(report.checks.find((check) => check.name === "WEB_READINESS")?.outcome, "FAILED");
});

test("fails if Direction state does not match operator expectation", async () => {
  const { impl } = stubFetch(healthy);
  const report = await runWebHostedPreflight(
    { baseUrl: BASE_URL, expectedDirection: "enabled" },
    { fetchImpl: impl },
  );
  assert.equal(report.status, "FAILED");
  assert.equal(report.checks.find((check) => check.name === "WEB_READINESS")?.outcome, "FAILED");
});

test("fails if privacy headers are missing or weakened", async () => {
  const { impl } = stubFetch((path) => {
    if (path === "/capture") {
      return {
        status: 200,
        body: "<html></html>",
        headers: {
          "x-robots-tag": "noindex",
          "referrer-policy": "origin",
          "x-content-type-options": "nosniff",
        },
      };
    }
    return healthy(path);
  });

  const report = await runWebHostedPreflight(
    { baseUrl: BASE_URL, expectedDirection: "dormant" },
    { fetchImpl: impl },
  );
  assert.equal(report.status, "FAILED");
  assert.equal(report.checks.find((check) => check.name === "WEB_PRIVACY_HEADERS")?.outcome, "FAILED");
});

test("fails if robots policy does not disallow the whole shell", async () => {
  const { impl } = stubFetch((path) => {
    if (path === "/robots.txt") {
      return { status: 200, body: "User-Agent: *\nAllow: /\n", headers: { "content-type": "text/plain" } };
    }
    return healthy(path);
  });

  const report = await runWebHostedPreflight(
    { baseUrl: BASE_URL, expectedDirection: "dormant" },
    { fetchImpl: impl },
  );
  assert.equal(report.status, "FAILED");
  assert.equal(report.checks.find((check) => check.name === "WEB_ROBOTS_NO_INDEX")?.outcome, "FAILED");
});

test("sanitizes network failures without exposing provider details", async () => {
  const impl = (async () => {
    throw new Error("connect ECONNREFUSED private-provider-host:443");
  }) as unknown as typeof fetch;

  const report = await runWebHostedPreflight(
    { baseUrl: BASE_URL, expectedDirection: "dormant" },
    { fetchImpl: impl },
  );
  const serialized = JSON.stringify(report);
  assert.equal(report.status, "FAILED");
  assert.ok(!serialized.includes("ECONNREFUSED"));
  assert.ok(!serialized.includes("private-provider-host"));
  assert.ok(!serialized.includes(BASE_URL));
});

test("configuration requires an exact HTTPS origin and defaults Direction expectation to dormant", () => {
  assert.deepEqual(
    webHostedPreflightConfigurationFromEnv({ LIFE_OS_WEB_PREFLIGHT_BASE_URL: `${BASE_URL}/` }),
    { baseUrl: BASE_URL, expectedDirection: "dormant" },
  );

  for (const value of [
    "http://life-os-web.example",
    "https://user:password@life-os-web.example",
    "https://life-os-web.example/path",
    "https://life-os-web.example/?x=1",
    "not-a-url",
  ]) {
    assert.throws(
      () => webHostedPreflightConfigurationFromEnv({ LIFE_OS_WEB_PREFLIGHT_BASE_URL: value }),
      WebHostedPreflightConfigurationError,
    );
  }
});

test("configuration accepts explicit enabled expectation and rejects other values", () => {
  assert.equal(
    webHostedPreflightConfigurationFromEnv({
      LIFE_OS_WEB_PREFLIGHT_BASE_URL: BASE_URL,
      LIFE_OS_WEB_PREFLIGHT_EXPECT_DIRECTION: "enabled",
    }).expectedDirection,
    "enabled",
  );

  assert.throws(
    () => webHostedPreflightConfigurationFromEnv({
      LIFE_OS_WEB_PREFLIGHT_BASE_URL: BASE_URL,
      LIFE_OS_WEB_PREFLIGHT_EXPECT_DIRECTION: "maybe",
    }),
    WebHostedPreflightConfigurationError,
  );
});
