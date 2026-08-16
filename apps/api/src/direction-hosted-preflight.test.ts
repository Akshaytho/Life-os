import assert from "node:assert/strict";
import test from "node:test";
import { runDirectionHostedPreflight } from "./direction-hosted-preflight";

const BASE_URL = "https://life-os-development.example";
const TOKEN = "synthetic-direction-session-token";
const PROBE_ID = "lifeos-preflight-absent-direction-fixed";

interface RecordedRequest {
  method: string;
  path: string;
  authorization: string | undefined;
}

function directionOverview() {
  return {
    current: {
      id: "direction-synthetic",
      statement: "Synthetic development direction",
      status: "ACTIVE",
      authorityClass: "DECISION",
      decidedAt: "2026-08-16T09:00:00.000Z",
    },
    history: [{
      id: "direction-synthetic-old",
      statement: "Older synthetic development direction",
      status: "SUPERSEDED",
      authorityClass: "DECISION",
      decidedAt: "2026-08-15T09:00:00.000Z",
      endedAt: "2026-08-16T09:00:00.000Z",
    }],
  };
}

function healthyResponse(path: string, authorization: string | undefined): { status: number; body: unknown } {
  if (path === "/health/live") return { status: 200, body: { status: "ok" } };
  if (path === "/health/ready") return { status: 200, body: { status: "ready" } };
  if (path === "/api/v1/direction" && authorization === `Bearer ${TOKEN}`) {
    return { status: 200, body: directionOverview() };
  }
  if (!authorization) return { status: 401, body: { status: "authentication_required" } };
  if (authorization !== `Bearer ${TOKEN}`) return { status: 401, body: { status: "authentication_required" } };
  return { status: 404, body: { status: "not_found" } };
}

function stubFetch(
  responder: (path: string, authorization: string | undefined) => { status: number; body: unknown } = healthyResponse,
) {
  const recorded: RecordedRequest[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const headers = new Headers(init?.headers);
    const authorization = headers.get("authorization") ?? undefined;
    recorded.push({ method: init?.method ?? "GET", path: url.pathname, authorization });
    const result = responder(url.pathname, authorization);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, recorded };
}

test("Direction hosted preflight adds one authenticated GET and stays zero-write", async () => {
  const { impl, recorded } = stubFetch();
  const report = await runDirectionHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  assert.equal(report.status, "READY");
  assert.equal(report.baseline.status, "READY");
  assert.equal(report.direction.outcome, "PASSED");
  assert.equal(report.requestsIssued, report.baseline.requestsIssued + 1);
  assert.equal(report.privateWriteAttempts, 0);
  assert.ok(recorded.every((request) => request.method === "GET"));
  assert.deepEqual(recorded.at(-1), {
    method: "GET",
    path: "/api/v1/direction",
    authorization: `Bearer ${TOKEN}`,
  });
});

test("Direction hosted preflight accepts an empty canonical overview", async () => {
  const { impl } = stubFetch((path, authorization) => {
    if (path === "/api/v1/direction" && authorization === `Bearer ${TOKEN}`) {
      return { status: 200, body: { current: null, history: [] } };
    }
    return healthyResponse(path, authorization);
  });

  const report = await runDirectionHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );
  assert.equal(report.status, "READY");
  assert.equal(report.direction.outcome, "PASSED");
});

test("Direction hosted preflight rejects extra internal fields instead of blessing a privacy regression", async () => {
  const { impl } = stubFetch((path, authorization) => {
    if (path === "/api/v1/direction" && authorization === `Bearer ${TOKEN}`) {
      const body = directionOverview();
      return {
        status: 200,
        body: {
          ...body,
          current: { ...body.current, userId: "must-not-leak" },
        },
      };
    }
    return healthyResponse(path, authorization);
  });

  const report = await runDirectionHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );
  assert.equal(report.status, "FAILED");
  assert.equal(report.direction.outcome, "FAILED");
  assert.equal(JSON.stringify(report).includes("must-not-leak"), false);
});

test("Direction hosted preflight fails safely when the route is still dormant", async () => {
  const { impl } = stubFetch((path, authorization) => {
    if (path === "/api/v1/direction") return { status: 404, body: { status: "not_found" } };
    return healthyResponse(path, authorization);
  });

  const report = await runDirectionHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );
  assert.equal(report.status, "FAILED");
  assert.equal(report.direction.outcome, "FAILED");
});

test("Direction read is not attempted when baseline hosted preflight is already failed", async () => {
  const { impl, recorded } = stubFetch((path, authorization) => {
    if (path === "/health/ready") return { status: 503, body: { status: "not_ready" } };
    return healthyResponse(path, authorization);
  });

  const report = await runDirectionHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );
  assert.equal(report.status, "FAILED");
  assert.equal(report.direction.outcome, "FAILED");
  assert.equal(recorded.some((request) => request.path === "/api/v1/direction"), false);
  assert.equal(report.requestsIssued, report.baseline.requestsIssued);
});

test("Direction hosted preflight report never includes token, base URL or Direction row content", async () => {
  const { impl } = stubFetch();
  const report = await runDirectionHostedPreflight(
    { baseUrl: BASE_URL, accessToken: TOKEN },
    { fetchImpl: impl, probeId: PROBE_ID },
  );

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(TOKEN), false);
  assert.equal(serialized.includes(BASE_URL), false);
  assert.equal(serialized.includes("Synthetic development direction"), false);
  assert.equal(serialized.includes("direction-synthetic"), false);
});
