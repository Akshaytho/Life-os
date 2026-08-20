import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function pageFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) return pageFiles(child);
    return entry.isFile() && entry.name === "page.tsx" ? [child] : [];
  }));
  return nested.flat();
}

async function routeSource(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("every user-facing page is free of sample/demo/prototype runtime data", async () => {
  const pages = await pageFiles(new URL("../app/", import.meta.url));
  assert.ok(pages.length > 0, "expected at least one app page");

  for (const page of pages) {
    const routePath = decodeURIComponent(page.pathname);
    const source = await readFile(page, "utf8");
    const imports = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import "))
      .join("\n");

    assert.doesNotMatch(routePath, /\/sample\//i, `${routePath} must not expose a sample route`);
    assert.doesNotMatch(imports, /sample|demo|prototype/i, `${routePath} must not import sample/demo/prototype data`);
  }
});

test("real-capable routes use their authenticated live surfaces", async () => {
  const today = await routeSource("../app/page.tsx");
  const calendar = await routeSource("../app/calendar/page.tsx");
  const capture = await routeSource("../app/capture/page.tsx");

  assert.match(today, /<LiveToday(?:\s+[^>]*)?\s*\/>/);
  assert.match(today, /NEXT_PUBLIC_LIFE_OS_DAILY_RETURN_ENABLED/);
  assert.match(today, /<LiveToday dailyReturnEnabled=\{dailyReturnConfigured\(\)\} \/>/);
  assert.match(calendar, /<LiveCanonicalCalendar\s*\/>/);
  assert.match(capture, /<LiveCaptureRouting\s*\/>/);
});

test("unfinished Memory route fails closed instead of fabricating state", async () => {
  const source = await routeSource("../app/memory/page.tsx");
  assert.match(source, /<RealDataOnlySurface/);
});
