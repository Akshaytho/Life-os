import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("Memory real route is private and visual fixture is isolated", async () => {
  const page = await source("../app/memory/page.tsx");
  const visual = await source("../app/visual-review/memory/page.tsx");
  assert.match(page, /<LifeOsAuthGate/);
  assert.match(page, /<LiveMemory\s*\/>/);
  assert.doesNotMatch(page, /fixture|visualOverview|synthetic/i);
  assert.match(visual, /LIFE_OS_VISUAL_REVIEW_ENABLED/);
  assert.match(visual, /<LiveMemory visualOverview=\{fixture\} \/>/);
});

test("Memory client keeps writes explicit and source preserving", async () => {
  const component = await source("../components/live-memory.tsx");
  const api = await source("../lib/life-os-api.ts");
  assert.match(component, /No automatic Memory\./);
  assert.match(component, /Retention does not make this a fact or decision/);
  assert.match(component, /Revise without erasing/);
  assert.match(api, /\/api\/v1\/memory\?/);
  assert.match(api, /\/api\/v1\/memory\/items/);
  assert.match(api, /Idempotency-Key/);
});
