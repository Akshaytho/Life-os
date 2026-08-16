import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_AUTH_EMAIL_LENGTH,
  MAX_AUTH_PASSWORD_LENGTH,
  normalizeAuthEmail,
  prepareSignInCredentials,
} from "../lib/auth-input";

const whitespace = ["", " ", "  ", "\t", "\n", "\r", " \t", "\t ", " \n", "\n ", "\r\n"];
const canonicalEmail = "person+lifeos@example.com";

for (const [leftIndex, left] of whitespace.entries()) {
  for (const [rightIndex, right] of whitespace.entries()) {
    test(`auth normalizes surrounding whitespace ${leftIndex}-${rightIndex}`, () => {
      assert.equal(normalizeAuthEmail(`${left}${canonicalEmail}${right}`), canonicalEmail);
      const prepared = prepareSignInCredentials(`${left}${canonicalEmail}${right}`, "secret-value");
      assert.deepEqual(prepared, { ok: true, email: canonicalEmail, password: "secret-value" });
    });
  }
}

const blankEmails = ["", " ", "  ", "\t", "\n", "\r", "\r\n", " \t ", " \n ", "\t\r\n"];
for (const [index, email] of blankEmails.entries()) {
  test(`auth rejects blank email ${index}`, () => {
    assert.deepEqual(prepareSignInCredentials(email, "secret-value"), {
      ok: false,
      message: "Enter both email and password.",
    });
  });
}

const blankPasswords = ["", ...Array.from({ length: 9 }, () => "")];
for (const [index, password] of blankPasswords.entries()) {
  test(`auth rejects missing password ${index}`, () => {
    assert.deepEqual(prepareSignInCredentials(canonicalEmail, password), {
      ok: false,
      message: "Enter both email and password.",
    });
  });
}

const preservedPasswords = [
  " password",
  "password ",
  " password ",
  "p@ss word",
  "pässwörd",
  "密碼-123",
  "пароль-123",
  "كلمة-مرور",
  "🔐password",
  "line1\nline2",
  "tab\tinside",
  "quotes'\"inside",
  "backslash\\inside",
  "emoji-🧠-🎬",
  "UPPERlower123!",
  "a".repeat(64),
  "x".repeat(255),
  "0".repeat(512),
  "z".repeat(1024),
  "q".repeat(MAX_AUTH_PASSWORD_LENGTH),
];
for (const [index, password] of preservedPasswords.entries()) {
  test(`auth preserves password bytes ${index}`, () => {
    const prepared = prepareSignInCredentials(canonicalEmail, password);
    assert.equal(prepared.ok, true);
    if (prepared.ok) assert.equal(prepared.password, password);
  });
}

test("auth accepts maximum email length", () => {
  const email = `${"a".repeat(MAX_AUTH_EMAIL_LENGTH - "@x.io".length)}@x.io`;
  const prepared = prepareSignInCredentials(email, "password");
  assert.equal(prepared.ok, true);
});

test("auth rejects email beyond maximum length", () => {
  const email = `${"a".repeat(MAX_AUTH_EMAIL_LENGTH - "@x.io".length + 1)}@x.io`;
  assert.deepEqual(prepareSignInCredentials(email, "password"), {
    ok: false,
    message: "Email or password is too long.",
  });
});

test("auth rejects password beyond maximum length", () => {
  assert.deepEqual(prepareSignInCredentials(canonicalEmail, "x".repeat(MAX_AUTH_PASSWORD_LENGTH + 1)), {
    ok: false,
    message: "Email or password is too long.",
  });
});

test("auth does not lowercase or otherwise rewrite email identity", () => {
  const email = "Mixed.Case+Tag@Example.COM";
  const prepared = prepareSignInCredentials(email, "password");
  assert.equal(prepared.ok, true);
  if (prepared.ok) assert.equal(prepared.email, email);
});
