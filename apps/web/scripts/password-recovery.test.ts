import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAX_AUTH_EMAIL_LENGTH,
  MAX_AUTH_PASSWORD_LENGTH,
  prepareRecoveredPassword,
  prepareRecoveryEmail,
} from "../lib/auth-input";

const canonicalEmail = "person+lifeos@example.com";

test("recovery email uses the same bounded identity normalization as sign in", () => {
  assert.deepEqual(prepareRecoveryEmail(`  ${canonicalEmail}\n`), { ok: true, email: canonicalEmail });
  assert.deepEqual(prepareRecoveryEmail(" \t\n "), { ok: false, message: "Enter your email address." });
  assert.deepEqual(prepareRecoveryEmail("x".repeat(MAX_AUTH_EMAIL_LENGTH + 1)), { ok: false, message: "Email is too long." });
});

test("recovered password must be confirmed exactly without rewriting its bytes", () => {
  const password = "  private-🔐-password  ";
  assert.deepEqual(prepareRecoveredPassword(password, password), { ok: true, password });
  assert.deepEqual(prepareRecoveredPassword(password, `${password}!`), { ok: false, message: "The new passwords do not match." });
  assert.deepEqual(prepareRecoveredPassword("", ""), { ok: false, message: "Enter and confirm your new password." });
  assert.deepEqual(
    prepareRecoveredPassword("x".repeat(MAX_AUTH_PASSWORD_LENGTH + 1), "x".repeat(MAX_AUTH_PASSWORD_LENGTH + 1)),
    { ok: false, message: "Password is too long." },
  );
});

test("browser recovery uses only reviewed user-scoped Supabase Auth methods", async () => {
  const providerPath = new URL("../components/life-os-auth-provider.tsx", import.meta.url);
  const recoveryPath = new URL("../components/life-os-password-recovery.tsx", import.meta.url);
  const [provider, recovery] = await Promise.all([
    readFile(providerPath, "utf8"),
    readFile(recoveryPath, "utf8"),
  ]);

  assert.match(provider, /auth\.resetPasswordForEmail\(prepared\.email, \{ redirectTo \}\)/);
  assert.match(provider, /window\.location\.origin\}\/auth\/recovery/);
  assert.match(provider, /event === "PASSWORD_RECOVERY"/);
  assert.match(provider, /auth\.updateUser\(\{ password: prepared\.password \}\)/);
  assert.match(recovery, /recoveryMode && Boolean\(session\)/);

  for (const forbidden of ["auth.admin", "service_role", "SUPABASE_SERVICE_ROLE_KEY", "secret key", "admin.updateUserById"]) {
    assert.equal(provider.includes(forbidden), false, `browser Auth provider must not contain ${forbidden}`);
    assert.equal(recovery.includes(forbidden), false, `browser recovery UI must not contain ${forbidden}`);
  }
});
