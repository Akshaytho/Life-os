import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("Brain Dump remains the existing Capture substrate with explicit classification and parking controls", async () => {
  const [page, liveCapture, controls, navigation] = await Promise.all([
    read("../app/capture/page.tsx"),
    read("../components/live-capture-routing.tsx"),
    read("../components/brain-dump-not-now-controls.tsx"),
    read("../components/app-navigation.tsx"),
  ]);
  assert.match(page, /area="Brain Dump"/);
  assert.match(liveCapture, /<BrainDumpNotNowControls/);
  assert.match(controls, /FINAL REVIEW · NO WRITE YET/);
  assert.match(controls, /Direction, Journey, Calendar, Today, Memory, goals, and projects/);
  assert.match(navigation, /<span>Brain Dump<\/span>/);
});

test("NOT NOW has a private mobile review route and the synthetic visual route fails closed", async () => {
  const [page, surface, visual] = await Promise.all([
    read("../app/not-now/page.tsx"),
    read("../components/live-not-now.tsx"),
    read("../app/visual-review/not-now/page.tsx"),
  ]);
  assert.match(page, /<LifeOsAuthGate/);
  assert.match(page, /<LiveNotNow/);
  assert.match(surface, /Not abandoned/);
  assert.match(surface, /cannot promote the thought/);
  assert.match(visual, /LIFE_OS_VISUAL_REVIEW_ENABLED/);
  assert.match(visual, /if \(!visualReviewEnabled\(\)\) notFound\(\)/);
});
