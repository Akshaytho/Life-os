import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import type { RoutingIdGenerator } from "../../../packages/domain/write-boundary";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";
import { createLifeOsPrivateCaptureServer, type PrivateCaptureApiDependencies } from "./private-capture-api";

class MatrixVerifier implements SessionVerifier {
  async verify(value: string) {
    if (value === "owner-session") return { userId: "owner-user" };
    if (value === "other-session") return { userId: "other-user" };
    return undefined;
  }
}

class MatrixInterpreter implements CaptureInterpreter {
  calls = 0;
  async interpret() {
    this.calls += 1;
    return {
      interpreter: "SAFE_FALLBACK" as const,
      intent: "RAW_THOUGHT" as const,
      certainty: "UNSPECIFIED" as const,
      confidence: 0,
      observations: [],
      clarification: "Review this Capture before applying anything.",
      proposals: [{
        key: "keep-raw",
        destination: "BRAIN_DUMP" as const,
        operation: "KEEP_RAW_CAPTURE" as const,
        summary: "Keep the raw Capture for review",
        targetTrustClass: "SUGGESTION" as const,
        approvalMode: "REVIEW_AND_APPLY" as const,
        state: "PROPOSED" as const,
        reason: "Safe fallback never commits canonical life state",
        payloadJson: {},
      }],
    };
  }
}

class MatrixIds implements RoutingIdGenerator {
  private counts = { capture: 0, interpretation: 0, proposal: 0 };
  next(prefix: "capture" | "interpretation" | "proposal") {
    this.counts[prefix] += 1;
    return `${prefix}-matrix-${this.counts[prefix]}`;
  }
}

function fixture() {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const interpreter = new MatrixInterpreter();
  let request = 0;
  let now = 0;
  const deps: PrivateCaptureApiDependencies = {
    sessionVerifier: new MatrixVerifier(),
    transportClock: { now: () => "2026-08-17T00:00:00.000Z" },
    requestIds: { next: () => `request-matrix-${++request}` },
    unitOfWork,
    interpreter,
    captureClock: { now: () => "2026-08-17T00:00:01.000Z" },
    routingIds: new MatrixIds(),
    runtime: { environment: "ci", releaseSha: "capture-matrix", platform: "CI" },
    telemetry: { emit() {} },
    operationTimer: {
      nowMs() { now += 1; return now; },
      nowIso() { return "2026-08-17T00:00:02.000Z"; },
    },
  };
  return { deps, unitOfWork, interpreter };
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

function request(rawText: string, key: string, extraHeaders: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: {
      authorization: "Bearer owner-session",
      "content-type": "application/json",
      "idempotency-key": key,
      ...extraHeaders,
    },
    body: JSON.stringify({ rawText }),
  };
}

const validTexts = [
  ...Array.from({ length: 50 }, (_, index) => `Capture matrix ${index}: ${"x".repeat((index % 70) + 1)}`),
  " leading space is preserved",
  "trailing space is preserved ",
  "line one\nline two",
  "tab\tinside",
  "emoji 🧠🎬✈️",
  "తెలుగు జీవితం",
  "ಕನ್ನಡ ಜೀವನ",
  "हिन्दी जीवन",
  "日本語の記録",
  "العربية حياة",
  "русский текст",
  "accented café résumé naïve",
  "punctuation !@#$%^&*()[]{}<>?/|",
  "quotes 'single' and \"double\"",
  "slashes /path/ and \\windows\\",
  "zero 0 false-looking text",
  "date 2026-08-17T03:47:00+05:30",
  "url-like https://example.invalid/path?q=1#x",
  "a".repeat(799),
  "b".repeat(800),
];

const validContentTypes = [
  "application/json",
  "Application/JSON",
  "APPLICATION/JSON",
  "application/json; charset=utf-8",
  "application/json;charset=UTF-8",
  " application/json ",
  "application/json; profile=life-os",
  "Application/Json; Charset=UTF-8",
];

const invalidContentTypes = [
  "text/plain",
  "application/xml",
  "text/json",
  "application/problem+json",
  "application/json-patch+json",
  "multipart/form-data",
  "application/x-www-form-urlencoded",
  "text/html",
  "application/octet-stream",
  "image/png",
  "audio/mpeg",
  "video/mp4",
];

const invalidKeys = [
  "",
  "short",
  "123456789012345",
  "has space 123456789",
  "has/slash/1234567890",
  "has?query1234567890",
  "has#hash12345678901",
  "has@at1234567890123",
  "has+plus12345678901",
  "üunicode12345678901",
  "x".repeat(129),
  " leading-1234567890",
  "trailing-1234567890 ",
];

test("Capture private transport hardening matrix covers 100+ distinct cases", async (t) => {
  const f = fixture();
  let successfulCreates = 0;

  await withServer(f.deps, async (baseUrl) => {
    for (const [index, rawText] of validTexts.entries()) {
      await t.test(`valid raw Capture ${index}`, async () => {
        const response = await fetch(`${baseUrl}/api/v1/captures`, request(rawText, `capture-matrix-valid-${String(index).padStart(3, "0")}`));
        assert.equal(response.status, 201);
        const responseText = await response.text();
        assert.equal(responseText.includes(rawText), false, "raw source must not echo in create receipt");
        successfulCreates += 1;
      });
    }

    for (const [index, contentType] of validContentTypes.entries()) {
      await t.test(`accepted JSON media type ${index}`, async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/captures`,
          request(`media-valid-${index}`, `capture-matrix-media-valid-${String(index).padStart(3, "0")}`, { "content-type": contentType }),
        );
        assert.equal(response.status, 201);
        successfulCreates += 1;
      });
    }

    for (const [index, contentType] of invalidContentTypes.entries()) {
      await t.test(`rejected non-JSON media type ${index}`, async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/captures`,
          request(`media-invalid-${index}`, `capture-matrix-media-bad-${String(index).padStart(3, "0")}`, { "content-type": contentType }),
        );
        assert.equal(response.status, 415);
        assert.deepEqual(await response.json(), { status: "unsupported_media_type" });
      });
    }

    for (const [index, key] of invalidKeys.entries()) {
      await t.test(`rejected idempotency token ${index}`, async () => {
        const response = await fetch(`${baseUrl}/api/v1/captures`, request(`bad-key-${index}`, key));
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { status: "invalid_idempotency_key" });
      });
    }

    const blankTexts = ["", " ", "  ", "\t", "\n", "\r", "\r\n", " \t ", " \n ", "\t\r\n"];
    for (const [index, rawText] of blankTexts.entries()) {
      await t.test(`rejected blank raw Capture ${index}`, async () => {
        const response = await fetch(`${baseUrl}/api/v1/captures`, request(rawText, `capture-matrix-blank-${String(index).padStart(3, "0")}`));
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { status: "invalid_request" });
      });
    }

    for (const [index, length] of [801, 802, 850, 900, 1000, 1500].entries()) {
      await t.test(`rejected raw Capture over 800 chars ${index}`, async () => {
        const response = await fetch(
          `${baseUrl}/api/v1/captures`,
          request("z".repeat(length), `capture-matrix-over-${String(index).padStart(3, "0")}`),
        );
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { status: "invalid_request" });
      });
    }

    const malformedBodies: Array<{ name: string; body: string }> = [
      { name: "invalid JSON", body: "{" },
      { name: "array", body: "[]" },
      { name: "null", body: "null" },
      { name: "string", body: JSON.stringify("text") },
      { name: "number", body: "1" },
      { name: "boolean", body: "true" },
      { name: "missing rawText", body: "{}" },
      { name: "extra key", body: JSON.stringify({ rawText: "x", userId: "forged" }) },
      { name: "numeric rawText", body: JSON.stringify({ rawText: 7 }) },
      { name: "null rawText", body: JSON.stringify({ rawText: null }) },
    ];
    for (const [index, item] of malformedBodies.entries()) {
      await t.test(`rejected malformed envelope ${item.name}`, async () => {
        const response = await fetch(`${baseUrl}/api/v1/captures`, {
          method: "POST",
          headers: {
            authorization: "Bearer owner-session",
            "content-type": "application/json",
            "idempotency-key": `capture-matrix-envelope-${String(index).padStart(3, "0")}`,
          },
          body: item.body,
        });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { status: "invalid_request" });
      });
    }

    const authHeaders = [
      undefined,
      "",
      "Bearer",
      "Bearer ",
      "Basic abcdef",
      "bearer owner-session",
      "Bearer invalid-session",
      "Bearer owner-session extra",
      "Bearer owner-session,other",
      "Token owner-session",
    ];
    for (const [index, authorization] of authHeaders.entries()) {
      await t.test(`rejected authentication envelope ${index}`, async () => {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          "idempotency-key": `capture-matrix-auth-${String(index).padStart(3, "0")}`,
        };
        if (authorization !== undefined) headers.authorization = authorization;
        const response = await fetch(`${baseUrl}/api/v1/captures`, {
          method: "POST",
          headers,
          body: JSON.stringify({ rawText: `auth-${index}` }),
        });
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { status: "authentication_required" });
      });
    }

    await t.test("same key and source replays without duplicate write", async () => {
      const key = "capture-matrix-replay-0001";
      const first = await fetch(`${baseUrl}/api/v1/captures`, request("replay source", key));
      const replay = await fetch(`${baseUrl}/api/v1/captures`, request("replay source", key));
      assert.equal(first.status, 201);
      assert.equal(replay.status, 200);
      assert.equal((await replay.json() as { status: string }).status, "replayed");
      successfulCreates += 1;
    });

    await t.test("same key with changed source conflicts", async () => {
      const key = "capture-matrix-conflict-0001";
      assert.equal((await fetch(`${baseUrl}/api/v1/captures`, request("source one", key))).status, 201);
      const conflict = await fetch(`${baseUrl}/api/v1/captures`, request("source two", key));
      assert.equal(conflict.status, 409);
      assert.deepEqual(await conflict.json(), { status: "idempotency_conflict" });
      successfulCreates += 1;
    });

    await t.test("same idempotency token is isolated by authenticated user", async () => {
      const key = "capture-matrix-users-0001";
      const first = await fetch(`${baseUrl}/api/v1/captures`, request("owner source", key));
      const second = await fetch(`${baseUrl}/api/v1/captures`, {
        ...request("other source", key),
        headers: {
          authorization: "Bearer other-session",
          "content-type": "application/json",
          "idempotency-key": key,
        },
      });
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      successfulCreates += 2;
    });
  });

  const snapshot = f.unitOfWork.snapshot();
  assert.equal(snapshot.captures.length, successfulCreates);
  assert.equal(snapshot.interpretations.length, successfulCreates);
  assert.equal(snapshot.routingProposals.length, successfulCreates);
  assert.equal(snapshot.calendarPlans.length, 0);
  assert.equal(snapshot.domainEvents.length, 0);
  assert.equal(f.interpreter.calls, successfulCreates);
});
