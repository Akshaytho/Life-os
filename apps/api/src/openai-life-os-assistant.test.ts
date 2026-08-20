import assert from "node:assert/strict";
import test from "node:test";
import type { LifeOsAssistantInput } from "../../../packages/intelligence/life-os-assistant";
import {
  OpenAiLifeOsAssistant,
  OpenAiLifeOsAssistantError,
} from "../../../packages/intelligence/openai-life-os-assistant";

const input: LifeOsAssistantInput = {
  mode: "RESET",
  question: "What can I return to?",
  localDate: "2026-08-19",
  timeZone: "Asia/Kolkata",
  sources: [{
    sourceId: "direction:active",
    domain: "YOU",
    authorityClass: "DECISION",
    title: "Current direction",
    excerpt: "Build a stable financial and creative foundation.",
    occurredAt: "2026-08-12T09:00:00.000Z",
  }],
};

function providerResponse(output: unknown): Response {
  return new Response(JSON.stringify({
    status: "completed",
    output: [{
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(output) }],
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("OpenAI assistant sends a no-tools, no-store, strict source-bounded request", async () => {
  let request: RequestInit | undefined;
  const assistant = new OpenAiLifeOsAssistant({
    apiKey: "server-secret",
    model: "reviewed-model",
    async fetchImpl(_url, init) {
      request = init;
      return providerResponse({
        answer: "Return to the current direction without turning the reflection into a new commitment.",
        citedSourceIds: ["direction:active"],
      });
    },
  });

  const result = await assistant.answer(input);
  assert.equal(result.modelName, "reviewed-model");
  assert.deepEqual(result.citedSourceIds, ["direction:active"]);
  assert.equal(new Headers(request?.headers).get("Authorization"), "Bearer server-secret");
  const body = JSON.parse(String(request?.body)) as Record<string, any>;
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, []);
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.text.format.schema.properties.citedSourceIds.items.enum, ["direction:active"]);
  assert.equal(String(request?.body).includes("server-secret"), false);
});

test("OpenAI assistant forwards code-owned Memory provenance as untrusted read-only context", async () => {
  let request: RequestInit | undefined;
  const assistant = new OpenAiLifeOsAssistant({
    apiKey: "server-secret",
    model: "reviewed-model",
    async fetchImpl(_url, init) {
      request = init;
      return providerResponse({ answer: "This retained learning remains reflection evidence.", citedSourceIds: ["memory:root-1:revision:2"] });
    },
  });
  await assistant.answer({
    ...input,
    sources: [{
      sourceId: "memory:root-1:revision:2",
      domain: "MEMORY",
      authorityClass: "REFLECTION",
      title: "Retained learning · Room tone",
      excerpt: "A short comparison made layering easier to hear.",
      occurredAt: "2026-08-18T18:30:00.000Z",
      memoryProvenance: {
        rootId: "root-1",
        itemId: "item-2",
        revision: 2,
        kind: "LEARNING",
        relationship: "NEW",
        sourceDomain: "JOURNEY_PRACTICE",
        sourceEntityId: "completion-1",
        sourceLabel: "Journey practice · Environmental sound",
        sourceOccurredAt: "2026-08-18T17:45:00.000Z",
      },
    }],
  });
  const body = JSON.parse(String(request?.body)) as Record<string, any>;
  const providerInput = JSON.parse(body.input) as Record<string, any>;
  assert.equal(providerInput.sources[0].memoryProvenance.revision, 2);
  assert.equal(providerInput.sources[0].authorityClass, "REFLECTION");
  assert.match(body.instructions, /MEMORY source is an explicitly retained reflection/);
  assert.deepEqual(body.tools, []);
  assert.equal(body.store, false);
});

test("OpenAI assistant rejects citations outside the supplied context", async () => {
  const assistant = new OpenAiLifeOsAssistant({
    apiKey: "server-secret",
    model: "reviewed-model",
    async fetchImpl() {
      return providerResponse({ answer: "Unsupported", citedSourceIds: ["invented"] });
    },
  });
  await assert.rejects(
    assistant.answer(input),
    (error: unknown) => error instanceof OpenAiLifeOsAssistantError && error.code === "INVALID_RESPONSE",
  );
});

test("OpenAI assistant rejects duplicate citations, refusals, and malformed provider output", async () => {
  const responses = [
    providerResponse({
      answer: "Duplicate",
      citedSourceIds: ["direction:active", "direction:active"],
    }),
    new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
    }), { status: 200 }),
    new Response("not-json", { status: 200 }),
  ];
  for (const response of responses) {
    const assistant = new OpenAiLifeOsAssistant({
      apiKey: "server-secret",
      model: "reviewed-model",
      async fetchImpl() { return response; },
    });
    await assert.rejects(
      assistant.answer(input),
      (error: unknown) => error instanceof OpenAiLifeOsAssistantError
        && (error.code === "INVALID_RESPONSE" || error.code === "REFUSED"),
    );
  }
});

test("OpenAI assistant maps network and non-success responses to provider unavailable", async () => {
  const assistants = [
    new OpenAiLifeOsAssistant({
      apiKey: "server-secret",
      model: "reviewed-model",
      async fetchImpl() { throw new Error("secret-bearing transport failure"); },
    }),
    new OpenAiLifeOsAssistant({
      apiKey: "server-secret",
      model: "reviewed-model",
      async fetchImpl() { return new Response("provider detail", { status: 500 }); },
    }),
  ];
  for (const assistant of assistants) {
    await assert.rejects(
      assistant.answer(input),
      (error: unknown) => error instanceof OpenAiLifeOsAssistantError
        && error.code === "PROVIDER_UNAVAILABLE",
    );
  }
});
