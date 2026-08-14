import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import { SafeFallbackCaptureInterpreter } from "../../../packages/intelligence/safe-fallback-capture-interpreter";
import type { PrivateApiDependencies } from "./private-api";
import { createLifeOsApiServer, type LifeOsApiServerDependencies } from "./api-server";

const runtime = {
  environment: "development" as const,
  releaseSha: "runtime-composition-test",
  platform: "OTHER" as const,
};

const health = {
  provenance: runtime,
  readiness: { async check() { return true; } },
};

async function withServer(
  dependencies: LifeOsApiServerDependencies,
  work: (baseUrl: string) => Promise<void>,
) {
  const server = createLifeOsApiServer(dependencies);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function authenticationBoundaryOnly(): PrivateApiDependencies {
  return {
    sessionVerifier: { async verify() { return undefined; } },
    transportClock: { now: () => "2026-08-14T10:00:00.000Z" },
    requestIds: { next: () => "request-composition-test" },
    proposalReviewReader: { async getCaptureReview() { return undefined; } },
    interactionLedgerReader: { async getTrace() { return undefined; } },
    unitOfWork: new InMemoryWriteUnitOfWork(),
    interpreter: new SafeFallbackCaptureInterpreter(),
    captureClock: { now: () => "2026-08-14T10:00:00.000Z" },
    routingIds: { next: (prefix) => `${prefix}-composition-test` },
    mutationClock: { now: () => "2026-08-14T10:00:01.000Z" },
    applyIds: { next: (prefix) => `${prefix}-composition-test` },
    runtime,
    telemetry: { emit() {} },
    operationTimer: {
      nowMs: () => 1,
      nowIso: () => "2026-08-14T10:00:02.000Z",
    },
  };
}

test("health-only composition does not accidentally expose reviewed private route shapes", async () => {
  await withServer({ health }, async (baseUrl) => {
    const live = await fetch(`${baseUrl}/health/live`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { status: "ok" });

    const privateRoute = await fetch(`${baseUrl}/api/v1/captures/capture-1/review`);
    assert.equal(privateRoute.status, 404);
    assert.deepEqual(await privateRoute.json(), { status: "not_found" });
  });
});

test("explicit private composition dispatches private routes through authentication while health stays public", async () => {
  await withServer({ health, privateApi: authenticationBoundaryOnly() }, async (baseUrl) => {
    const ready = await fetch(`${baseUrl}/health/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ready" });

    const privateRoute = await fetch(`${baseUrl}/api/v1/captures/capture-1/review`);
    assert.equal(privateRoute.status, 401);
    assert.deepEqual(await privateRoute.json(), { status: "authentication_required" });
    assert.equal(privateRoute.headers.get("cache-control"), "private, no-store");
  });
});

test("non-Life-OS paths remain a minimal not-found surface even when private API is composed", async () => {
  await withServer({ health, privateApi: authenticationBoundaryOnly() }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/debug/env`);
    assert.equal(response.status, 404);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), { status: "not_found" });
    assert.equal(body.includes("DATABASE_URL"), false);
  });
});
