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
  releaseSha: "daily-return-route-gating",
  platform: "CI" as const,
};

async function withServer(
  dailyReturnEnabled: boolean,
  work: (baseUrl: string, verifierCalls: string[]) => Promise<void>,
) {
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
      directionEnabled: false,
      dailyReturnEnabled,
      sessionVerifier: verifier,
      randomUuid: () => "00000000-0000-4000-8000-000000000001",
      now: () => new Date("2026-08-18T09:00:00.000Z"),
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

test("Daily Return routes look unknown and skip authentication while disabled", async () => {
  await withServer(false, async (baseUrl, verifierCalls) => {
    for (const path of [
      "/api/v1/daily-return?date=2026-08-18",
      "/api/v1/daily-return/logs",
      "/api/v1/daily-return/review",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: path.includes("?") ? "GET" : "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
          "idempotency-key": "daily-return-disabled-key",
        },
        ...(path.includes("?") ? {} : { body: JSON.stringify({}) }),
      });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: "not_found" });
    }
    assert.deepEqual(verifierCalls, []);
  });
});

test("enabling Daily Return exposes only its authenticated reviewed boundary", async () => {
  await withServer(true, async (baseUrl, verifierCalls) => {
    const response = await fetch(
      `${baseUrl}/api/v1/daily-return?date=2026-08-18`,
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "authentication_required" });
    assert.deepEqual(verifierCalls, []);
  });
});
