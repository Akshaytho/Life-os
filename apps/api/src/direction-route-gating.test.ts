import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { Pool } from "pg";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import { createLifeOsPrivateApiServer } from "./private-api";
import { createPrivateApiRuntimeDependencies } from "./private-api-runtime";

const runtime = {
  environment: "ci" as const,
  releaseSha: "direction-route-gating",
  platform: "CI" as const,
};

async function withServer(directionEnabled: boolean, work: (baseUrl: string, verifierCalls: string[]) => Promise<void>) {
  const verifierCalls: string[] = [];
  const verifier: SessionVerifier = {
    async verify(token: string) {
      verifierCalls.push(token);
      return token === "valid-token" ? { userId: "user-a" } : undefined;
    },
  };
  const pool = new Pool({ max: 1 });
  const dependencies = createPrivateApiRuntimeDependencies(
    pool,
    {},
    runtime,
    { emit() {} },
    {
      directionEnabled,
      sessionVerifier: verifier,
      randomUuid: () => "00000000-0000-4000-8000-000000000001",
      now: () => new Date("2026-08-16T09:00:00.000Z"),
    },
  );
  const server = createLifeOsPrivateApiServer(dependencies);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await work(`http://127.0.0.1:${address.port}`, verifierCalls);
  } finally {
    server.close();
    await once(server, "close");
    await pool.end();
  }
}

test("Direction routes are indistinguishable from unknown routes while the capability is disabled", async () => {
  await withServer(false, async (baseUrl, verifierCalls) => {
    const read = await fetch(`${baseUrl}/api/v1/direction`, {
      headers: { authorization: "Bearer valid-token" },
    });
    assert.equal(read.status, 404);
    assert.deepEqual(await read.json(), { status: "not_found" });

    const write = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: {
        authorization: "Bearer valid-token",
        "content-type": "application/json",
        "idempotency-key": "direction-disabled-key",
      },
      body: JSON.stringify({}),
    });
    assert.equal(write.status, 404);
    assert.deepEqual(await write.json(), { status: "not_found" });
    assert.deepEqual(verifierCalls, []);
  });
});

test("enabling Direction exposes the reviewed authenticated boundary", async () => {
  await withServer(true, async (baseUrl, verifierCalls) => {
    const read = await fetch(`${baseUrl}/api/v1/direction`);
    assert.equal(read.status, 401);
    assert.deepEqual(await read.json(), { status: "authentication_required" });
    assert.deepEqual(verifierCalls, []);
  });
});
