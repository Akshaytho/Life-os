import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isTodayPath } from "../lib/navigation-paths";

const here = dirname(fileURLToPath(import.meta.url));

for (const path of ["/", "/today", "/today/", "/today/details", "/today/anything/nested"]) {
  test(`Today navigation recognizes ${path}`, () => {
    assert.equal(isTodayPath(path), true);
  });
}

const unrelatedPaths = Array.from({ length: 100 }, (_, index) => {
  const suffix = String(index).padStart(3, "0");
  return [
    `/today-${suffix}`,
    `/today_old_${suffix}`,
    `/todays/${suffix}`,
    `/capture/today-${suffix}`,
    `/calendar/today-${suffix}`,
  ][index % 5];
});

for (const [index, path] of unrelatedPaths.entries()) {
  test(`Today navigation rejects unrelated path ${index}`, () => {
    assert.equal(isTodayPath(path), false);
  });
}

test("explicit /today route renders the same canonical Today boundary", async () => {
  const root = await readFile(resolve(here, "../app/page.tsx"), "utf8");
  const alias = await readFile(resolve(here, "../app/today/page.tsx"), "utf8");
  for (const required of ["LifeOsAuthGate", "LiveToday", "area=\"Today\""]) {
    assert.equal(root.includes(required), true);
    assert.equal(alias.includes(required), true);
  }
});

test("recovery and route-error navigation target a real Today route", async () => {
  const recovery = await readFile(resolve(here, "../components/life-os-password-recovery.tsx"), "utf8");
  const errorBoundary = await readFile(resolve(here, "../app/error.tsx"), "utf8");
  assert.equal(recovery.includes('href="/today"'), true);
  assert.equal(errorBoundary.includes('href="/today"'), true);
});
