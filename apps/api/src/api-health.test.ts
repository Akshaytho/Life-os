import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createLifeOsHealthServer } from "./api-health";

async function withServer(
  readiness: { check(): Promise<boolean> },
  work: (baseUrl: string) => Promise<void>,
) {
  const server = createLifeOsHealthServer({
    provenance: {
      environment: "development",
      releaseSha: "release-safe",
      deploymentId: "deployment-internal",
      serviceName: "life-os-api",
      platform: "RAILWAY",
    },
    readiness,
  });

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

test("liveness is process-only and does not invoke external readiness", async () => {
  let checks = 0;
  await withServer({
    async check() {
      checks += 1;
      throw new Error("secret database detail");
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/live`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(checks, 0);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

test("readiness returns only ready/not_ready and sanitizes provider failures", async () => {
  await withServer({ async check() { throw new Error("postgresql://user:password@secret-host/db"); } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/ready`);
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.equal(body, JSON.stringify({ status: "not_ready" }));
    assert.equal(body.includes("password"), false);
    assert.equal(body.includes("secret-host"), false);
  });
});

test("readiness succeeds when the configured probe succeeds", async () => {
  await withServer({ async check() { return true; } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ready" });
  });
});

test("health routes do not expose release/deployment metadata in their public bodies", async () => {
  await withServer({ async check() { return true; } }, async (baseUrl) => {
    const live = await (await fetch(`${baseUrl}/health/live`)).text();
    const ready = await (await fetch(`${baseUrl}/health/ready`)).text();
    const combined = `${live}${ready}`;
    assert.equal(combined.includes("release-safe"), false);
    assert.equal(combined.includes("deployment-internal"), false);
    assert.equal(combined.includes("life-os-api"), false);
  });
});

test("unknown routes and mutation methods fail without becoming accidental API surface", async () => {
  await withServer({ async check() { return true; } }, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/capture`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { status: "not_found" });

    const post = await fetch(`${baseUrl}/health/live`, { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
  });
});
