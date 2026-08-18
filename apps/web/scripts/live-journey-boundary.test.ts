import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

async function source(relative: string) {
  return readFile(resolve(here, relative), "utf8");
}

test("Journey route stays unavailable unless its separate browser switch is true", async () => {
  const page = await source("../app/journey/page.tsx");
  assert.equal(page.includes("NEXT_PUBLIC_LIFE_OS_JOURNEY_ENABLED"), true);
  assert.equal(page.includes("<RealDataOnlySurface"), true);
  assert.equal(page.includes("<LifeOsAuthGate"), true);
  assert.equal(page.includes("<LiveJourney"), true);
});

test("live Journey uses canonical API and shared Auth rather than sample Journey models", async () => {
  const component = await source("../components/live-journey.tsx");
  assert.equal(component.includes("useLifeOsAuth"), true);
  assert.equal(component.includes("getJourneyOverview"), true);
  assert.equal(component.includes("activateJourney"), true);
  assert.equal(component.includes("JourneyViewModel"), false);
  assert.equal(component.includes("demoMode"), false);
  assert.equal(component.includes("SAMPLE"), false);
});

test("empty Journey state is explicit and activation requires review plus acknowledgement", async () => {
  const component = await source("../components/live-journey.tsx");
  for (const required of [
    "No active Journey",
    "Nothing inferred",
    "ACTIVATE_JOURNEY",
    "Review this decision",
    "FINAL REVIEW · NO CHANGE YET",
    "expectedCurrentJourneyId",
    "idempotencyAttempt",
  ]) {
    assert.equal(component.includes(required), true, `missing ${required}`);
  }
});

test("Journey UI does not claim evidence that has no canonical persistence yet", async () => {
  const component = await source("../components/live-journey.tsx");
  assert.equal(component.includes("Not recorded in Journey V1 yet"), true);
  assert.equal(component.includes("Practice, reels, retained learnings and technique evidence stay absent"), true);
  assert.equal(component.includes("evidenceCounts"), false);
  assert.equal(component.includes("nextExperiment"), false);
});

test("Journey browser client uses separate read and idempotent activation endpoints", async () => {
  const client = await source("../lib/life-os-api.ts");
  assert.equal(client.includes('"/api/v1/journey"'), true);
  assert.equal(client.includes('"/api/v1/journey/current"'), true);
  assert.equal(client.includes('"Idempotency-Key"'), true);
  assert.equal(client.includes("ActivateJourneyCommand"), true);
});
