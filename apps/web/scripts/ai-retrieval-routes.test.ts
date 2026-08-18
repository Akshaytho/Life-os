import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("Ask Life OS real route is authentication-gated and real-data-only", async () => {
  const page = await source("../app/ask/page.tsx");
  assert.match(page, /<LifeOsAuthGate/);
  assert.match(page, /<LiveAiRetrieval\s*\/>/);
  assert.doesNotMatch(page, /visualResponse|sample|demo/i);
});

test("Ask Life OS UI preserves the read-only authority boundary", async () => {
  const component = await source("../components/live-ai-retrieval.tsx");
  assert.match(component, /AI OBSERVATION · READ ONLY/);
  assert.match(component, /Nothing changed\./);
  assert.match(component, /NO TOOLS · NO WRITES · NO AUTO-MEMORY/);
  assert.match(component, /It cannot change them\./);
  assert.doesNotMatch(component, /confidence|similarity score|chain-of-thought/i);
});

test("Ask Life OS browser transport uses one authenticated read-only endpoint", async () => {
  const transport = await source("../lib/life-os-api.ts");
  assert.match(transport, /privateRequest<AskLifeOsResponse>\(accessToken, "\/api\/v1\/ask"/);
  assert.match(transport, /method: "POST"/);
  assert.doesNotMatch(transport, /OPENAI_API_KEY/);
});

test("Ask visual review is explicitly synthetic and provider-free", async () => {
  const visual = await source("../app/visual-review/ask/page.tsx");
  assert.match(visual, /visualReviewEnabled/);
  assert.match(visual, /visualResponse/);
  assert.match(visual, /visual-review-model/);
  assert.doesNotMatch(visual, /askLifeOs\(/);
});
