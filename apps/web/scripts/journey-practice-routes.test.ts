import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("Journey user routes are authenticated and render only the live canonical surface", async () => {
  for (const pagePath of [
    "../app/journey/page.tsx",
    "../app/journey/travel-creator/sound-design/page.tsx",
  ]) {
    const page = await source(pagePath);
    assert.match(page, /LifeOsAuthGate/);
    assert.match(page, /LiveJourneyPractice/);
    assert.doesNotMatch(page, /RealDataOnlySurface|sample practice|prototype/i);
  }
});

test("Journey controls preserve explicit activation, append-only practice, and trust labels", async () => {
  const controls = await source("../components/live-journey-practice.tsx");
  assert.match(controls, /Review activation/);
  assert.match(controls, /Activate Sound Design/);
  assert.match(controls, /Start practice/);
  assert.match(controls, /Review completion/);
  assert.match(controls, /Complete practice/);
  assert.match(controls, /FACT · open and resumable · never overdue/);
  assert.match(controls, /reflection candidate, not automatic Memory/);
  assert.match(controls, /No Calendar item or Today task will be created/);
  assert.doesNotMatch(controls, /progress ring|percent complete|daily streak/i);
});

test("Journey API client sends bearer-authenticated idempotent writes to exact routes", async () => {
  const api = await source("../lib/life-os-api.ts");
  assert.match(api, /getJourneyPracticeOverview[\s\S]*"\/api\/v1\/journey"/);
  assert.match(api, /activateJourney[\s\S]*"\/api\/v1\/journey\/activate"/);
  assert.match(api, /startJourneyPractice[\s\S]*"\/api\/v1\/journey\/practice"/);
  assert.match(api, /completeJourneyPractice[\s\S]*journey\/practice\/\$\{encodeURIComponent\(sessionId\)\}\/complete/);
  assert.match(api, /"Idempotency-Key": idempotencyKey/);
  assert.match(api, /Authorization.*Bearer/);
}
);

test("Journey visual review covers activation and real practice chronology", async () => {
  const activation = await source("../app/visual-review/journey-activation/page.tsx");
  const practice = await source("../app/visual-review/journey-practice/page.tsx");
  const capture = await source("../../../scripts/capture-visuals.mjs");
  assert.match(activation, /activation: null/);
  assert.match(practice, /lifecycleState: "ACTIVE"/);
  assert.match(practice, /lifecycleState: "COMPLETED"/);
  assert.match(capture, /journey-activation-review/);
  assert.match(capture, /journey-practice-review/);
});
