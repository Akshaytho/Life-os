import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("Drift is an explicit global private action with no automatic direction mutation", async () => {
  const navigation = await source("../components/app-navigation.tsx");
  const page = await source("../app/drift/page.tsx");
  const surface = await source("../components/live-drift.tsx");

  assert.match(navigation, /href="\/drift"/);
  assert.match(navigation, /I&apos;m drifting/);
  assert.match(page, /area="Drift \+ Return"/);
  assert.match(page, /<LiveDrift \/>/);
  assert.match(surface, /You noticed/);
  assert.match(surface, /That is already a return/);
  assert.match(surface, /no automatic interpretation/);
  assert.match(surface, /does not change Direction or any other Life OS domain/);
  assert.match(surface, /no overdue state and no pressure score/i);
  assert.doesNotMatch(surface, /percentage|streakCount|driftScore/);
});

test("resolved Drift returns to Today for an immediate next action", async () => {
  const surface = await source("../components/live-drift.tsx");
  const styles = await source("../components/live-drift.module.css");
  assert.match(surface, /RESOLVED ·/);
  assert.match(surface, /<Link href="\/">See my next action\.<\/Link>/);
  assert.match(styles, /\.resolved a/);
  assert.match(styles, /\.resolved a \{ width: 100%; \}/);
});

test("synthetic Drift visual route fails closed and covers recorded, returning, and resolved states", async () => {
  const visual = await source("../app/visual-review/drift/page.tsx");
  assert.match(visual, /LIFE_OS_VISUAL_REVIEW_ENABLED/);
  assert.match(visual, /notFound\(\)/);
  assert.match(visual, /lifecycleState: "RECORDED"/);
  assert.match(visual, /lifecycleState: "STILL_RETURNING"/);
  assert.match(visual, /lifecycleState: "RESOLVED"/);
  assert.match(visual, /<LiveDrift visualItems=\{visualItems\} \/>/);
});