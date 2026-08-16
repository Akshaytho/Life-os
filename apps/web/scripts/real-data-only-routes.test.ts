import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeFiles = [
  "../app/page.tsx",
  "../app/calendar/page.tsx",
  "../app/capture/page.tsx",
  "../app/journey/page.tsx",
  "../app/memory/page.tsx",
] as const;

async function routeSource(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("user-facing Life OS routes never import sample or demo life data", async () => {
  for (const relativePath of routeFiles) {
    const source = await routeSource(relativePath);
    const imports = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import "))
      .join("\n");

    assert.doesNotMatch(imports, /sample|demo|prototype/i, `${relativePath} must not import sample/demo/prototype data`);
  }
});

test("real-capable routes use their authenticated live surfaces", async () => {
  const today = await routeSource("../app/page.tsx");
  const calendar = await routeSource("../app/calendar/page.tsx");
  const capture = await routeSource("../app/capture/page.tsx");

  assert.match(today, /<LiveToday\s*\/>/);
  assert.match(calendar, /<LiveCanonicalCalendar\s*\/>/);
  assert.match(capture, /<LiveCaptureRouting\s*\/>/);
});

test("unfinished Journey and Memory routes fail closed instead of fabricating state", async () => {
  for (const relativePath of ["../app/journey/page.tsx", "../app/memory/page.tsx"] as const) {
    const source = await routeSource(relativePath);
    assert.match(source, /<RealDataOnlySurface/);
    assert.doesNotMatch(source, /JourneyOverview|MemoryOverview|journeySample|memorySample/);
  }
});
