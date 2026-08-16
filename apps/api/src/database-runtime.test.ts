import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ApiRuntimeConfigurationError } from "./api-runtime";
import { databasePoolConfigurationFromEnv } from "./database-runtime";

const databaseUrl = "postgresql://lifeos_app.project:Synthetic-Only-Password-2026@db.example.invalid:5432/postgres";
const password = "Synthetic-Only-Password-2026";

// Public test trust material only. A self-signed synthetic CA that is never used against a
// real provider, so committing it alongside the tests introduces no secret.
const syntheticCertificate = `-----BEGIN CERTIFICATE-----
MIIDcTCCAlmgAwIBAgIUf0XVbY1WjZaFzIDOnYrQS16U5vIwDQYJKoZIhvcNAQEL
BQAwSDELMAkGA1UEBhMCVVMxFTATBgNVBAoMDExpZmUgT1MgVGVzdDEiMCAGA1UE
AwwZTGlmZSBPUyBTeW50aGV0aWMgVGVzdCBDQTAeFw0yNjA4MTYxODQ4MThaFw0z
NjA4MTMxODQ4MThaMEgxCzAJBgNVBAYTAlVTMRUwEwYDVQQKDAxMaWZlIE9TIFRl
c3QxIjAgBgNVBAMMGUxpZmUgT1MgU3ludGhldGljIFRlc3QgQ0EwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQCyVZUe0OoYQtfF+wmx01JEs7Z58QMCpNP6
cfZ+MZJhrDIZUsBYP6BYsKan1Kj1/ynnBYpMkHk9pDyAYJ886Uf1maLsMc2XrFRN
Uep/M+zxgO/NukvGEjdOOakmvAyW8AtEhLzYXIVjQ7TVb3g1JYTmLCyydsnx3pAE
BCOahZ5kuARAvaA6JsWKxqBIOJrw3FCyOnRER2r4+baq0gSZVgff82ZpGJMo5C+n
yMgIFmUQ2jjuMiFY8FWH9r1yttmn0ay/vSv6e6aTPQqPp5MeJbKyPvOFJ8Ox9nJ6
k+/lhQyBaLQO9A0vf0UprF7FZJVeCRg1//i0wiYTfg4PNox31jZhAgMBAAGjUzBR
MB0GA1UdDgQWBBSNbElLVyAQb+bLORkJRdVBi6zbzzAfBgNVHSMEGDAWgBSNbElL
VyAQb+bLORkJRdVBi6zbzzAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUA
A4IBAQBUpXsLLwfZTx6NkPjZY24YoQTk8DF8+oMeH1DtH92V1HGt0AOwzLXGyQdS
rWg3po9ZAtsUUAL5MMOUAFKCtmHTw5HqWOUw0qgXNGxlsJzHyXXIdn5fZEsWV1WF
U5xkD0ONRC1N3jhOUNPRMBOkuzpA595tQjw9536SaUJFjqlQypurRhSn8v1ePdN4
8953qF8cGPtkex7r44R6NNuFjICYCC59kZCOynYHwAYb5mixYmkK5+Ek3XYV5Hrp
Ny3nmqyJjKHWG33mbZhGRlVlF317X+me5S7aqb65B+QLRpESICcrQ5UHFzPz0fGt
n5kkrHWHJvwCwA+Ea0uj6Im2zE/X
-----END CERTIFICATE-----
`;

const fixtures = mkdtempSync(join(tmpdir(), "life-os-tls-"));

function fixture(name: string, contents: string): string {
  const path = join(fixtures, name);
  writeFileSync(path, contents);
  return path;
}

const validCaPath = fixture("valid-ca.crt", syntheticCertificate);
const malformedCaPath = fixture("malformed-ca.crt", "this file is not a certificate\n");
const privateKeyCaPath = fixture(
  "private-key.crt",
  `${syntheticCertificate}-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----\n`,
);

function developmentEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    LIFE_OS_ENVIRONMENT: "development",
    LIFE_OS_RELEASE_SHA: "release-1",
    DATABASE_URL: databaseUrl,
    ...overrides,
  };
}

function assertSanitized(error: unknown): boolean {
  assert.ok(error instanceof ApiRuntimeConfigurationError);
  const message = (error as Error).message;
  assert.equal(message.includes(password), false, "error must not echo the database password");
  assert.equal(message.includes(databaseUrl), false, "error must not echo DATABASE_URL");
  assert.equal(message.includes("db.example.invalid"), false, "error must not echo the database host");
  assert.equal(message.includes("MIIDcTCC"), false, "error must not echo certificate contents");
  return true;
}

test("hosted development refuses a database connection without an explicit TLS mode", () => {
  assert.throws(() => databasePoolConfigurationFromEnv(developmentEnv()), assertSanitized);
});

test("hosted development refuses the unverified transport mode", () => {
  assert.throws(
    () => databasePoolConfigurationFromEnv(developmentEnv({ LIFE_OS_DATABASE_TLS_MODE: "disable" })),
    assertSanitized,
  );
});

test("verify-full requires a reviewed certificate authority path", () => {
  assert.throws(
    () => databasePoolConfigurationFromEnv(developmentEnv({ LIFE_OS_DATABASE_TLS_MODE: "verify-full" })),
    assertSanitized,
  );
});

test("verify-full refuses a certificate authority path that does not exist", () => {
  assert.throws(
    () =>
      databasePoolConfigurationFromEnv(developmentEnv({
        LIFE_OS_DATABASE_TLS_MODE: "verify-full",
        LIFE_OS_DATABASE_TLS_CA_FILE: join(fixtures, "absent.crt"),
      })),
    assertSanitized,
  );
});

test("verify-full refuses a malformed certificate file", () => {
  assert.throws(
    () =>
      databasePoolConfigurationFromEnv(developmentEnv({
        LIFE_OS_DATABASE_TLS_MODE: "verify-full",
        LIFE_OS_DATABASE_TLS_CA_FILE: malformedCaPath,
      })),
    assertSanitized,
  );
});

test("verify-full refuses trust material that carries private key content", () => {
  assert.throws(
    () =>
      databasePoolConfigurationFromEnv(developmentEnv({
        LIFE_OS_DATABASE_TLS_MODE: "verify-full",
        LIFE_OS_DATABASE_TLS_CA_FILE: privateKeyCaPath,
      })),
    assertSanitized,
  );
});

test("verify-full refuses a certificate authority supplied as a URL", () => {
  assert.throws(
    () =>
      databasePoolConfigurationFromEnv(developmentEnv({
        LIFE_OS_DATABASE_TLS_MODE: "verify-full",
        LIFE_OS_DATABASE_TLS_CA_FILE: "https://example.invalid/root.crt",
      })),
    assertSanitized,
  );
});

test("verify-full builds pool configuration that verifies the reviewed authority", () => {
  const configuration = databasePoolConfigurationFromEnv(developmentEnv({
    LIFE_OS_DATABASE_TLS_MODE: "verify-full",
    LIFE_OS_DATABASE_TLS_CA_FILE: validCaPath,
  }));

  assert.ok(configuration);
  assert.equal(configuration.connectionString, databaseUrl);
  assert.equal(configuration.ssl?.rejectUnauthorized, true);
  assert.equal(configuration.ssl?.ca, syntheticCertificate);
});

test("connection-string SSL parameters cannot override the reviewed TLS contract", () => {
  for (const parameter of [
    "sslmode=no-verify",
    "sslmode=require",
    "sslmode=verify-full",
    "sslrootcert=/tmp/other.crt",
    "sslcert=/tmp/client.crt",
    "sslkey=/tmp/client.key",
    "SSLMODE=no-verify",
  ]) {
    assert.throws(
      () =>
        databasePoolConfigurationFromEnv(developmentEnv({
          DATABASE_URL: `${databaseUrl}?${parameter}`,
          LIFE_OS_DATABASE_TLS_MODE: "verify-full",
          LIFE_OS_DATABASE_TLS_CA_FILE: validCaPath,
        })),
      assertSanitized,
      `${parameter} must be refused`,
    );
  }
});

test("unsupported libpq middle modes are refused outright", () => {
  for (const mode of ["prefer", "allow", "require", "no-verify", "verify-ca", "true"]) {
    assert.throws(
      () =>
        databasePoolConfigurationFromEnv(developmentEnv({
          LIFE_OS_DATABASE_TLS_MODE: mode,
          LIFE_OS_DATABASE_TLS_CA_FILE: validCaPath,
        })),
      assertSanitized,
      `${mode} must be refused`,
    );
  }
});

test("disposable local and CI PostgreSQL may run without TLS", () => {
  for (const environment of ["local", "ci"]) {
    const configuration = databasePoolConfigurationFromEnv({
      LIFE_OS_ENVIRONMENT: environment,
      LIFE_OS_RELEASE_SHA: "release-1",
      DATABASE_URL: databaseUrl,
      LIFE_OS_DATABASE_TLS_MODE: "disable",
    });

    assert.ok(configuration);
    assert.equal(configuration.connectionString, databaseUrl);
    assert.equal(configuration.ssl, undefined);
  }
});

test("local runtime without a database stays undefined instead of inventing a connection", () => {
  assert.equal(
    databasePoolConfigurationFromEnv({ LIFE_OS_ENVIRONMENT: "local", LIFE_OS_RELEASE_SHA: "release-1" }),
    undefined,
  );
});

test("local and CI may also opt into verified TLS against a reviewed authority", () => {
  const configuration = databasePoolConfigurationFromEnv({
    LIFE_OS_ENVIRONMENT: "ci",
    LIFE_OS_RELEASE_SHA: "release-1",
    DATABASE_URL: databaseUrl,
    LIFE_OS_DATABASE_TLS_MODE: "verify-full",
    LIFE_OS_DATABASE_TLS_CA_FILE: validCaPath,
  });

  assert.equal(configuration?.ssl?.rejectUnauthorized, true);
});
