import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const liveScreens = [
  "../components/live-today.tsx",
  "../components/live-canonical-calendar.tsx",
  "../components/live-capture-routing.tsx",
];

const forbiddenPrivateAuthOwnership = [
  "getBrowserSupabaseClient",
  "BrowserAuthConfigurationError",
  "signInWithPassword",
  "onAuthStateChange",
  "auth.getSession",
  "setSession(",
  "setAuthState(",
  "setEmail(",
  "setPassword(",
];

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("live feature screens consume one shared Life OS Auth session instead of owning Supabase Auth", async (t) => {
  for (const path of liveScreens) {
    await t.test(path, async () => {
      const file = await source(path);
      assert.match(file, /useLifeOsAuth\(\)/);
      for (const token of forbiddenPrivateAuthOwnership) {
        assert.equal(file.includes(token), false, `${path} must not privately own Auth via ${token}`);
      }
    });
  }
});

test("the shared Auth provider remains the only browser Supabase Auth owner", async () => {
  const provider = await source("../components/life-os-auth-provider.tsx");
  assert.match(provider, /getBrowserSupabaseClient/);
  assert.match(provider, /auth\.getSession/);
  assert.match(provider, /onAuthStateChange/);
  assert.match(provider, /signInWithPassword/);
  assert.match(provider, /signOut/);
});

test("all private live routes retain the outer Auth gate", async () => {
  for (const path of ["../app/page.tsx", "../app/calendar/page.tsx", "../app/capture/page.tsx"]) {
    const file = await source(path);
    assert.match(file, /LifeOsAuthGate/);
  }
});
