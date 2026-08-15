import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import { SafeFallbackCaptureInterpreter } from "../../../packages/intelligence/safe-fallback-capture-interpreter";
import type { PrivateApiDependencies } from "./private-api";
import { createLifeOsApiServer, type LifeOsApiServerDependencies } from "./api-server";
import { PrivateCorsConfigurationError, privateCorsPolicyFromEnv } from "./private-cors";

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

const browserOrigin = "https://life-os-web.example";
const browserCors = privateCorsPolicyFromEnv({
  LIFE_OS_CORS_ALLOWED_ORIGINS: `${browserOrigin}, http://localhost:3000`,
} as NodeJS.ProcessEnv);

function varyFields(response: Response): string[] {
  return (response.headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
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

test("browser preflight allows only the reviewed private transport surface", async () => {
  await withServer({ health, privateApi: authenticationBoundaryOnly(), privateCors: browserCors }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures`, {
      method: "OPTIONS",
      headers: {
        Origin: browserOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type, idempotency-key",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), browserOrigin);
    assert.equal(response.headers.get("access-control-allow-methods"), "GET, POST");
    assert.equal(response.headers.get("access-control-allow-headers"), "Authorization, Content-Type, Idempotency-Key");
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
    assert.ok(varyFields(response).includes("origin"));
    assert.ok(varyFields(response).includes("access-control-request-method"));
    assert.ok(varyFields(response).includes("access-control-request-headers"));
  });
});

test("browser CORS rejects foreign origins before private authentication", async () => {
  await withServer({ health, privateApi: authenticationBoundaryOnly(), privateCors: browserCors }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures/capture-1/review`, {
      headers: { Origin: "https://not-life-os.example" },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { status: "origin_not_allowed" });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

test("allowed browser origins retain CORS headers on authentication responses", async () => {
  await withServer({ health, privateApi: authenticationBoundaryOnly(), privateCors: browserCors }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures/capture-1/review`, {
      headers: { Origin: browserOrigin },
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "authentication_required" });
    assert.equal(response.headers.get("access-control-allow-origin"), browserOrigin);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
    assert.ok(varyFields(response).includes("origin"));
    assert.ok(varyFields(response).includes("authorization"));
  });
});

test("health routes do not inherit private browser CORS policy", async () => {
  await withServer({ health, privateApi: authenticationBoundaryOnly(), privateCors: browserCors }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/live`, { headers: { Origin: browserOrigin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

test("private browser origin configuration rejects non-origin values", () => {
  for (const value of [
    "*",
    "https://life-os.example/path",
    "https://user:secret@life-os.example",
    "https://life-os.example?token=x",
    "file:///tmp/life-os",
    "https://life-os.example,",
  ]) {
    assert.throws(
      () => privateCorsPolicyFromEnv({ LIFE_OS_CORS_ALLOWED_ORIGINS: value } as NodeJS.ProcessEnv),
      PrivateCorsConfigurationError,
    );
  }
});
