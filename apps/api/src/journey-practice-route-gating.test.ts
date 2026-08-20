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
  releaseSha: "journey-practice-route-gating",
  platform: "CI" as const,
};

async function withServer(
  journeyPracticeEnabled: boolean,
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
      dailyReturnEnabled: false,
      brainDumpNotNowEnabled: false,
      driftEnabled: false,
      journeyPracticeEnabled,
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

test("Journey routes look unknown and skip authentication while disabled", async () => {
  await withServer(false, async (baseUrl, verifierCalls) => {
    for (const path of [
      "/api/v1/journey",
      "/api/v1/journey/activate",
      "/api/v1/journey/practice",
      "/api/v1/journey/practice/session-1/complete",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: path === "/api/v1/journey" ? "GET" : "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
          "idempotency-key": "journey-disabled-route-key",
        },
        ...(path === "/api/v1/journey" ? {} : { body: JSON.stringify({}) }),
      });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: "not_found" });
    }
    assert.deepEqual(verifierCalls, []);
  });
});

test("enabling Journey exposes only its authenticated reviewed boundary", async () => {
  await withServer(true, async (baseUrl, verifierCalls) => {
    const response = await fetch(`${baseUrl}/api/v1/journey`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "authentication_required" });
    assert.deepEqual(verifierCalls, []);
  });
});
