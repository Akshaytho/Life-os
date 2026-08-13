import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import type { RoutingIdGenerator } from "../../../packages/domain/write-boundary";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import type { CaptureInterpreter, CaptureInterpreterInput } from "../../../packages/intelligence/capture-interpreter";
import { createLifeOsPrivateCaptureServer, type PrivateCaptureApiDependencies } from "./private-capture-api";

class Verifier implements SessionVerifier {
  calls: string[] = [];
  fail = false;
  async verify(value: string) {
    this.calls.push(value);
    if (this.fail) throw new Error("upstream unavailable");
    if (value === "owner-session") return { userId: "owner-user" };
    if (value === "other-session") return { userId: "other-user" };
    return undefined;
  }
}

class Interpreter implements CaptureInterpreter {
  calls: CaptureInterpreterInput[] = [];
  failures = 0;
  async interpret(input: CaptureInterpreterInput) {
    this.calls.push({ ...input });
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("interpreter unavailable");
    }
    return {
      interpreter: "LIFE_OS_AI" as const,
      intent: "DATED_PLAN" as const,
      certainty: "TENTATIVE" as const,
      confidence: 0.82,
      observations: [{ id: "certainty", label: "Certainty", value: "Tentative", trustClass: "OBSERVATION" as const }],
      clarification: "Should this reserve time?",
      proposals: [{
        key: "calendar-plan",
        destination: "CALENDAR" as const,
        operation: "CREATE_CALENDAR_PLAN" as const,
        summary: "Prepare a tentative Calendar plan",
        targetTrustClass: "FACT" as const,
        approvalMode: "EXPLICIT_CONFIRMATION" as const,
        state: "NEEDS_CONFIRMATION" as const,
        reason: "Tentative wording",
        payloadJson: { title: "Synthetic plan", category: "Friends", commitment: "Flexible" },
      }],
    };
  }
}

class Ids implements RoutingIdGenerator {
  counts = { capture: 0, interpretation: 0, proposal: 0 };
  next(prefix: "capture" | "interpretation" | "proposal") {
    this.counts[prefix] += 1;
    return `${prefix}-http-${this.counts[prefix]}`;
  }
}

function fixture() {
  const verifier = new Verifier();
  const interpreter = new Interpreter();
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const telemetry: TechnicalTelemetryEvent[] = [];
  let request = 0;
  let now = 100;
  const deps: PrivateCaptureApiDependencies = {
    sessionVerifier: verifier,
    transportClock: { now: () => "2026-08-14T01:00:00.000Z" },
    requestIds: { next: () => `server-request-${++request}` },
    unitOfWork,
    interpreter,
    captureClock: { now: () => "2026-08-14T01:00:01.000Z" },
    routingIds: new Ids(),
    runtime: { environment: "ci", releaseSha: "capture-http-test", platform: "CI" },
    telemetry: { emit(event) { telemetry.push(structuredClone(event)); } },
    operationTimer: {
      nowMs() { now += 5; return now; },
      nowIso() { return "2026-08-14T01:00:02.000Z"; },
    },
  };
  return { deps, verifier, interpreter, unitOfWork, telemetry };
}

async function withServer(deps: PrivateCaptureApiDependencies, work: (baseUrl: string) => Promise<void>) {
  const server = createLifeOsPrivateCaptureServer(deps);
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

function options(text: string, session = "owner-session", key = "retry-key-00000001"): RequestInit {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${session}`,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify({ rawText: text }),
  };
}

test("verified owner creates Capture and response excludes source text and identity", async () => {
  const f = fixture();
  await withServer(f.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures?userId=forged`, {
      ...options("Owner source"),
      headers: { ...(options("x").headers as Record<string, string>), "x-user-id": "forged" },
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Authorization, Idempotency-Key");
    const text = await response.text();
    assert.equal(text.includes("Owner source"), false);
    assert.equal(text.includes("owner-user"), false);
    assert.equal(text.includes("owner-session"), false);
  });

  const state = f.unitOfWork.snapshot();
  assert.equal(state.captures.length, 1);
  assert.equal(state.captures[0].userId, "owner-user");
  assert.equal(state.captures[0].rawText, "Owner source");
  assert.match(state.captures[0].requestId, /^web-idem-v1:capture_create:[a-f0-9]{64}$/);
  assert.equal(state.captures[0].requestId.includes("retry-key-00000001"), false);
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
});

test("same authenticated retry replays one Capture while changed body conflicts", async () => {
  const f = fixture();
  await withServer(f.deps, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/v1/captures`, options("Same source"));
    const replay = await fetch(`${baseUrl}/api/v1/captures`, options("Same source"));
    const conflict = await fetch(`${baseUrl}/api/v1/captures`, options("Changed source"));
    assert.equal(first.status, 201);
    assert.equal(replay.status, 200);
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { status: "idempotency_conflict" });
  });

  const state = f.unitOfWork.snapshot();
  assert.equal(state.captures.length, 1);
  assert.equal(state.captures[0].rawText, "Same source");
  assert.equal(state.interpretations.length, 1);
  assert.equal(f.interpreter.calls.length, 1);
  assert.equal(f.telemetry.length, 3);
  assert.equal(f.telemetry[2].kind, "OPERATION");
  if (f.telemetry[2].kind !== "OPERATION") throw new Error("Expected operation telemetry");
  assert.equal(f.telemetry[2].outcome, "REJECTED");
});

test("same retry token is isolated by authenticated user", async () => {
  const f = fixture();
  await withServer(f.deps, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/v1/captures`, options("Owner source"))).status, 201);
    assert.equal((await fetch(`${baseUrl}/api/v1/captures`, options("Other source", "other-session"))).status, 201);
  });
  const captures = f.unitOfWork.snapshot().captures;
  assert.equal(captures.length, 2);
  assert.notEqual(captures[0].requestId, captures[1].requestId);
  assert.deepEqual(captures.map((item) => item.userId).sort(), ["other-user", "owner-user"]);
});

test("authentication is resolved before retry-key, media-type and body validation", async () => {
  const f = fixture();
  await withServer(f.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "invalid",
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "authentication_required" });
  });
  assert.equal(f.unitOfWork.snapshot().captures.length, 0);
});

test("strict write envelope rejects missing retry key, bad media type, extra fields and oversized input", async () => {
  const f = fixture();
  await withServer(f.deps, async (baseUrl) => {
    const missingKey = await fetch(`${baseUrl}/api/v1/captures`, {
      method: "POST",
      headers: { authorization: "Bearer owner-session", "content-type": "application/json" },
      body: JSON.stringify({ rawText: "No write" }),
    });
    assert.equal(missingKey.status, 400);
    assert.deepEqual(await missingKey.json(), { status: "invalid_idempotency_key" });

    const wrongType = await fetch(`${baseUrl}/api/v1/captures`, {
      ...options("No write", "owner-session", "retry-key-00000002"),
      headers: { ...options("x").headers as Record<string, string>, "idempotency-key": "retry-key-00000002", "content-type": "text/plain" },
    });
    assert.equal(wrongType.status, 415);

    const extra = await fetch(`${baseUrl}/api/v1/captures`, {
      method: "POST",
      headers: { ...options("x", "owner-session", "retry-key-00000003").headers as Record<string, string> },
      body: JSON.stringify({ rawText: "No write", userId: "forged" }),
    });
    assert.equal(extra.status, 400);

    const oversized = await fetch(`${baseUrl}/api/v1/captures`, {
      method: "POST",
      headers: { ...options("x", "owner-session", "retry-key-00000004").headers as Record<string, string> },
      body: JSON.stringify({ rawText: "x".repeat(9000) }),
    });
    assert.equal(oversized.status, 413);
  });
  assert.equal(f.unitOfWork.snapshot().captures.length, 0);
  assert.equal(f.interpreter.calls.length, 0);
});

test("interpreter failure is sanitized and same-key retry completes the preserved Capture", async () => {
  const f = fixture();
  f.interpreter.failures = 1;
  await withServer(f.deps, async (baseUrl) => {
    const failed = await fetch(`${baseUrl}/api/v1/captures`, options("Durable source"));
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { status: "capture_processing_failed" });
    const retry = await fetch(`${baseUrl}/api/v1/captures`, options("Durable source"));
    assert.equal(retry.status, 201);
  });
  const state = f.unitOfWork.snapshot();
  assert.equal(state.captures.length, 1);
  assert.equal(state.interpretations.length, 1);
  assert.equal(f.interpreter.calls.length, 2);
  assert.equal(f.interpreter.calls[0].receivedAt, "2026-08-14T01:00:00.000Z");
  assert.equal(f.interpreter.calls[1].receivedAt, "2026-08-14T01:00:00.000Z");
  assert.equal(JSON.stringify(f.telemetry).includes("Durable source"), false);
});

test("Apply and Reject routes stay absent; wrong method is rejected before authentication", async () => {
  const f = fixture();
  await withServer(f.deps, async (baseUrl) => {
    for (const path of ["/api/v1/proposals/p-1/apply", "/api/v1/proposals/p-1/reject"]) {
      const response = await fetch(`${baseUrl}${path}`, { method: "POST" });
      assert.equal(response.status, 404);
    }
    const wrongMethod = await fetch(`${baseUrl}/api/v1/captures`, { method: "GET" });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "POST");
  });
  assert.equal(f.verifier.calls.length, 0);
});
