import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (relativePath: string) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("Reviews is a real authenticated route and Today links to it", async () => {
  const [page, today] = await Promise.all([
    source("../app/reviews/page.tsx"),
    source("../components/live-today.tsx"),
  ]);
  assert.match(page, /area="Weekly \+ Monthly Reviews"/);
  assert.match(page, /<LivePeriodicReviews\s*\/>/);
  assert.match(today, /href="\/reviews"/);
});

test("period review UI preserves reflection and no-score boundaries", async () => {
  const component = await source("../components/live-periodic-reviews.tsx");
  assert.match(component, /TIME COMPRESSION, NOT A SCORE/);
  assert.match(component, /No automatic truth changes/);
  assert.match(component, /worth preserving.*candidate/i);
  assert.doesNotMatch(component, /streak count|scorecard|mastery percentage/i);
  assert.match(component, /submitPeriodicReview/);
  assert.match(component, /expectedCurrentReviewId/);
});

test("period visual fixture is synthetic-only and capture script asserts its trust copy", async () => {
  const [fixture, capture] = await Promise.all([
    source("../app/visual-review/periodic-reviews/page.tsx"),
    source("../../../scripts/capture-visuals.mjs"),
  ]);
  assert.match(fixture, /LIFE_OS_VISUAL_REVIEW_ENABLED/);
  assert.match(fixture, /visualOverview=\{fixture\}/);
  assert.match(capture, /periodic-reviews-review/);
  assert.match(capture, /TIME COMPRESSION, NOT A SCORE/);
});
