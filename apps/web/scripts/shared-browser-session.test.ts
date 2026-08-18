import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("root layout provides one shared Life OS browser session context", async () => {
  const layout = await source("../app/layout.tsx");
  assert.match(layout, /import \{ LifeOsAuthProvider \}/);
  assert.match(layout, /<LifeOsAuthProvider>[\s\S]*<AppNavigation \/>[\s\S]*\{children\}[\s\S]*<\/LifeOsAuthProvider>/);
});

test("real private entry routes require the shared session gate", async () => {
  const cases = [
    ["../app/page.tsx", "Today", "LiveToday"],
    ["../app/calendar/page.tsx", "Calendar", "LiveCanonicalCalendar"],
    ["../app/capture/page.tsx", "Brain Dump", "LiveCaptureRouting"],
    ["../app/drift/page.tsx", "Drift + Return", "LiveDrift"],
  ] as const;

  for (const [path, area, liveSurface] of cases) {
    const page = await source(path);
    const escapedArea = area.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(page, /import \{ LifeOsAuthGate \}/, `${path} must use the shared auth gate`);
    assert.match(
      page,
      new RegExp(`<LifeOsAuthGate[\\s\\S]*area="${escapedArea}"[\\s\\S]*<${liveSurface}(?:\\s+[^>]*)?\\s*\\/>[\\s\\S]*<\\/LifeOsAuthGate>`),
    );
  }
});

test("Direction uses the shared gate only when the real Direction runtime is enabled", async () => {
  const page = await source("../app/you/page.tsx");
  assert.match(page, /if \(liveDirectionConfigured\(\)\)[\s\S]*<LifeOsAuthGate[\s\S]*area="Direction"[\s\S]*<LiveDirection \/>/);
  assert.match(page, /return <DormantDirection \/>/);
});

test("shared provider uses the real Supabase browser client and never stores credentials", async () => {
  const provider = await source("../components/life-os-auth-provider.tsx");
  assert.match(provider, /getBrowserSupabaseClient\(\)/);
  assert.match(provider, /client\.auth\.getSession\(\)/);
  assert.match(provider, /client\.auth\.onAuthStateChange/);
  assert.match(provider, /auth\.signInWithPassword/);
  assert.match(provider, /auth\.signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(provider, /useState\([^\n]*(email|password)/i);
  assert.doesNotMatch(provider, /localStorage|sessionStorage/);
});
