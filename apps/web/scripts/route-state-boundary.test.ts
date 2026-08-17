import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("route loading state refuses substitute personal data", async () => {
  const source = await readFile(new URL("../app/loading.tsx", import.meta.url), "utf8");
  assert.match(source, /No sample or substitute life data is shown/);
  assert.match(source, /aria-busy="true"/);
});

test("route error boundary exposes retry/navigation without rendering internal error details", async () => {
  const source = await readFile(new URL("../app/error.tsx", import.meta.url), "utf8");
  assert.match(source, /onClick=\{reset\}/);
  assert.match(source, /href="\/today"/);
  assert.match(source, /kept provider and runtime details private/);

  for (const forbidden of ["error.message", "error.stack", "JSON.stringify(error)", "console.error(error)"]) {
    assert.equal(source.includes(forbidden), false, `route error UI must not expose ${forbidden}`);
  }
});

test("route states include narrow-screen and reduced-motion behavior", async () => {
  const source = await readFile(new URL("../app/route-state.module.css", import.meta.url), "utf8");
  assert.match(source, /@media \(max-width: 520px\)/);
  assert.match(source, /grid-template-columns: 1fr/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
});
