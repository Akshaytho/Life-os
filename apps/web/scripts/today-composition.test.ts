import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("Today composition is independently browser-gated and keeps the Calendar-only fallback", async () => {
  for (const path of ["../app/page.tsx", "../app/today/page.tsx"]) {
    const page = await source(path);
    assert.match(page, /NEXT_PUBLIC_LIFE_OS_TODAY_COMPOSITION_ENABLED/);
    assert.match(page, /compositionEnabled=\{compositionConfigured\(\)\}/);
  }
  const live = await source("../components/live-today.tsx");
  assert.match(live, /compositionEnabled = false/);
  assert.match(live, /getCanonicalCalendar/);
  assert.match(live, /getDirectionOverview/);
  assert.match(live, /getJourneyPracticeOverview/);
  assert.match(live, /getDriftOverview/);
  assert.match(live, /getMemoryOverview/);
});

test("Today focus remains a source-labeled projection with no write", async () => {
  const component = await source("../components/today-composition.tsx");
  assert.match(component, /DELIBERATE FOCUS · \{deliberate\.authority\}/);
  assert.match(component, /item\.commitment === "Fixed"/);
  assert.match(component, /model\.direction \? "DECISION" : "EMPTY"/);
  assert.match(component, /Not a task or Calendar commitment/);
  assert.match(component, /MEMORY · REFLECTION · OPTIONAL CONTEXT/);
  assert.match(component, /Return is the goal, not zero drift/);
  assert.doesNotMatch(component, /retainMemoryItem|startJourneyPractice|recordDriftReturn|confirmCalendar/);
});

test("composed Today visual fixture is synthetic-only", async () => {
  const page = await source("../app/visual-review/today-composed/page.tsx");
  assert.match(page, /LIFE_OS_VISUAL_REVIEW_ENABLED/);
  assert.match(page, /SYNTHETIC VISUAL REVIEW/);
  assert.match(page, /TodayComposition/);
});

test("mobile Today keeps current reality above the dock and preserves a safe scroll end", async () => {
  const styles = await source("../components/live-today.module.css");
  assert.match(styles, /padding-bottom: calc\(142px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /\.heroGrid \{\s*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.primarySignal,\s*\.nextSignal \{\s*min-height: 175px/);
});
