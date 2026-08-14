import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import { createPrivateApiRuntimeDependencies } from "./private-api-runtime";
import { SupabaseSessionVerifierConfigurationError } from "./supabase-session-verifier";

const runtime = {
  environment: "development" as const,
  releaseSha: "runtime-composition-test",
  platform: "OTHER" as const,
};

const telemetry = { emit() {} };

async function withIdlePool(work: (pool: Pool) => Promise<void> | void) {
  const pool = new Pool({ max: 1 });
  try {
    await work(pool);
  } finally {
    await pool.end();
  }
}

test("runtime composition uses server-owned clocks and opaque IDs with safe fallback by default", async () => {
  await withIdlePool(async (pool) => {
    const verifier: SessionVerifier = { async verify() { return { userId: "verified-user" }; } };
    let uuid = 0;
    let monotonic = 100;
    const dependencies = createPrivateApiRuntimeDependencies(
      pool,
      {},
      runtime,
      telemetry,
      {
        sessionVerifier: verifier,
        randomUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
        now: () => new Date("2026-08-14T10:30:00.000Z"),
        monotonicNowMs: () => ++monotonic,
      },
    );

    assert.equal(dependencies.sessionVerifier, verifier);
    assert.equal(dependencies.transportClock.now(), "2026-08-14T10:30:00.000Z");
    assert.equal(dependencies.captureClock.now(), "2026-08-14T10:30:00.000Z");
    assert.equal(dependencies.mutationClock.now(), "2026-08-14T10:30:00.000Z");
    assert.match(dependencies.requestIds.next(), /^request-[0-9a-f-]+$/);
    assert.match(dependencies.routingIds.next("capture"), /^capture-[0-9a-f-]+$/);
    assert.match(dependencies.routingIds.next("proposal"), /^proposal-[0-9a-f-]+$/);
    assert.match(dependencies.applyIds.next("calendar"), /^calendar-[0-9a-f-]+$/);
    assert.match(dependencies.applyIds.next("event"), /^event-[0-9a-f-]+$/);
    assert.equal(dependencies.operationTimer.nowMs(), 101);
    assert.equal(dependencies.operationTimer.nowIso(), "2026-08-14T10:30:00.000Z");

    const interpreted = await dependencies.interpreter.interpret({
      rawText: "Private source",
      receivedAt: "2026-08-14T10:30:00.000Z",
    });
    assert.equal(interpreted.interpreter, "SAFE_FALLBACK");
    assert.equal(interpreted.proposals[0].destination, "BRAIN_DUMP");
    assert.equal(interpreted.proposals[0].state, "PROPOSED");
  });
});

test("runtime composition requires real Supabase verifier configuration when no verifier is injected", async () => {
  await withIdlePool((pool) => {
    assert.throws(
      () => createPrivateApiRuntimeDependencies(pool, {}, runtime, telemetry),
      (error: unknown) => error instanceof SupabaseSessionVerifierConfigurationError && /SUPABASE_URL is required/.test(error.message),
    );
  });
});

test("ordinary private runtime configuration needs only browser-safe Supabase project key material", async () => {
  await withIdlePool((pool) => {
    const dependencies = createPrivateApiRuntimeDependencies(
      pool,
      {
        SUPABASE_URL: "https://project-ref.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      },
      runtime,
      telemetry,
      { randomUuid: () => "00000000-0000-4000-8000-000000000001" },
    );

    assert.ok(dependencies.sessionVerifier);
    assert.ok(dependencies.unitOfWork);
    assert.ok(dependencies.proposalReviewReader);
    assert.ok(dependencies.interactionLedgerReader);
  });
});
