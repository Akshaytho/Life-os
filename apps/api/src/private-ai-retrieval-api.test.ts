import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import type { LifeOsAssistant } from "../../../packages/intelligence/life-os-assistant";
import { OpenAiLifeOsAssistantError } from "../../../packages/intelligence/openai-life-os-assistant";
import { handlePrivateAiRetrievalRequest } from "./private-ai-retrieval-api";

const validCommand = {
  mode: "ASK",
  question: "What matters in the current context?",
  localDate: "2026-08-19",
  timeZone: "Asia/Kolkata",
  calendarFrom: "2026-08-19T00:00:00.000Z",
  calendarTo: "2026-08-26T00:00:00.000Z",
};

async function withServer(
  assistant: LifeOsAssistant,
  work: (baseUrl: string, telemetry: TechnicalTelemetryEvent[]) => Promise<void>,
) {
  const telemetry: TechnicalTelemetryEvent[] = [];
  let requestId = 0;
  let timer = 10;
  const server = createServer((request, response) => {
    void handlePrivateAiRetrievalRequest(request, response, {
      sessionVerifier: {
        async verify(token) {
          return token === "valid-token" ? { userId: "user-a" } : undefined;
        },
      },
      transportClock: { now: () => "2026-08-19T12:00:00.000Z" },
      requestIds: { next: () => `transport-${++requestId}` },
      aiAssistant: assistant,
      aiRetrievalClock: { now: () => "2026-08-19T12:00:01.000Z" },
      directionReader: {
        async listForUser(userId) {
          return [{
            directionId: "direction-active",
            userId,
            statement: "Build a stable financial and creative foundation.",
            status: "ACTIVE",
            decidedAt: "2026-08-12T09:00:00.000Z",
            endedAt: null,
          }];
        },
      },
      canonicalCalendarReader: { async listOverlapping() { return []; } },
      dailyReturnReader: {
        async listLogEntriesForDate() { return []; },
        async listReviewsForDate() { return []; },
      },
      brainDumpNotNowReader: {
        async listBrainDumpItems() { return []; },
        async listNotNowItems() { return []; },
      },
      driftReader: { async listCurrent() { return []; } },
      journeyPracticeReader: { async getSnapshot() { return { sessions: [] }; } },
      memoryReader: {
        async getOverview() {
          return {
            trustedNow: [], candidates: [], timeCompression: { month: null, weeks: [] }, patterns: [],
            items: [{
              itemId: "memory-private-v1", rootId: "memory-private", revision: 1,
              kind: "LEARNING", title: "Private retained learning",
              body: "Small comparisons make sound choices easier to hear.",
              authorityClass: "REFLECTION", relationship: "NEW", status: "CURRENT",
              retainedAt: "2026-08-18T18:30:00.000Z", recordedAt: "2026-08-18T18:30:01.000Z",
              source: {
                domain: "JOURNEY_PRACTICE", entityId: "completion-private",
                label: "Journey practice · Environmental sound",
                occurredAt: "2026-08-18T17:45:00.000Z", authorityClass: "REFLECTION",
              },
              history: [],
            }],
          };
        },
      },
      runtime: { environment: "ci", releaseSha: "ask-api-test", platform: "CI" },
      telemetry: { emit(event) { telemetry.push(event); } },
      operationTimer: {
        nowMs: () => ++timer,
        nowIso: () => "2026-08-19T12:00:02.000Z",
      },
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await work(`http://127.0.0.1:${address.port}`, telemetry);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function headers(token = "valid-token") {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

test("private Ask Life OS returns a read-only source-visible answer and safe telemetry", async () => {
  const assistant: LifeOsAssistant = {
    async answer(input) {
      return {
        answer: "The active direction remains the strongest current source.",
        citedSourceIds: [input.sources[0]!.sourceId],
        modelName: "fixture-model",
      };
    },
  };
  await withServer(assistant, async (baseUrl, telemetry) => {
    const response = await fetch(`${baseUrl}/api/v1/ask`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(validCommand),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, any>;
    assert.equal(body.answerAuthority, "AI_OBSERVATION");
    assert.equal(body.sources[0].authorityClass, "DECISION");
    assert.equal(body.policyVersion, "ask-life-os-retrieval-v1.1");
    const memory = body.sources.find((source: Record<string, unknown>) => source.domain === "MEMORY");
    assert.equal(memory.authorityClass, "REFLECTION");
    assert.equal(memory.memoryProvenance.sourceDomain, "JOURNEY_PRACTICE");
    assert.equal(telemetry.length, 1);
    assert.equal((telemetry[0] as any).operation, "ASK_LIFE_OS");
    const serialized = JSON.stringify(telemetry);
    assert.equal(serialized.includes(validCommand.question), false);
    assert.equal(serialized.includes(body.answer), false);
    assert.equal(serialized.includes("user-a"), false);
  });
});

test("private Ask Life OS rejects unauthenticated and malformed requests", async () => {
  const assistant: LifeOsAssistant = {
    async answer() { return { answer: "unused", citedSourceIds: [], modelName: "fixture" }; },
  };
  await withServer(assistant, async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/api/v1/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validCommand),
    });
    assert.equal(unauthenticated.status, 401);

    const malformed = await fetch(`${baseUrl}/api/v1/ask`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...validCommand, extra: true }),
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { status: "invalid_request" });
  });
});

test("provider failure returns no fallback answer or provider detail", async () => {
  const assistant: LifeOsAssistant = {
    async answer() { throw new OpenAiLifeOsAssistantError("PROVIDER_UNAVAILABLE"); },
  };
  await withServer(assistant, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/ask`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(validCommand),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "ai_unavailable" });
  });
});
