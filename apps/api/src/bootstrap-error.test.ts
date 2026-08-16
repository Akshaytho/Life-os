import assert from "node:assert/strict";
import test from "node:test";
import { safeBootstrapDiagnosticCode, safeBootstrapErrorClass } from "./bootstrap-error";

test("returns a normal Error subclass name without exposing its message", () => {
  class ApiRuntimeConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ApiRuntimeConfigurationError";
    }
  }

  const error = new ApiRuntimeConfigurationError("postgresql://user:secret@example.invalid/db");
  assert.equal(safeBootstrapErrorClass(error), "ApiRuntimeConfigurationError");
});

test("refuses arbitrary error names that could carry secret-bearing text", () => {
  const error = new Error("secret-message");
  error.name = "Error secret-token";
  assert.equal(safeBootstrapErrorClass(error), "UnknownBootstrapError");
});

test("uses a fixed class for non-Error thrown values", () => {
  assert.equal(safeBootstrapErrorClass("secret-token"), "UnknownBootstrapError");
  assert.equal(safeBootstrapErrorClass({ password: "secret" }), "UnknownBootstrapError");
});

test("allows only fixed uppercase diagnostic tokens", () => {
  const error = new Error("postgresql://user:secret@example.invalid/db") as Error & { diagnosticCode?: unknown };
  error.diagnosticCode = "DATABASE_URL_SSL_PARAMETERS";
  assert.equal(safeBootstrapDiagnosticCode(error), "DATABASE_URL_SSL_PARAMETERS");

  error.diagnosticCode = "secret=value";
  assert.equal(safeBootstrapDiagnosticCode(error), undefined);
  error.diagnosticCode = { secret: "value" };
  assert.equal(safeBootstrapDiagnosticCode(error), undefined);
});

test("maps only reviewed TLS and network provider codes to fixed diagnostics", () => {
  const cases = [
    ["ERR_TLS_CERT_ALTNAME_INVALID", "DATABASE_TLS_HOSTNAME_MISMATCH"],
    ["SELF_SIGNED_CERT_IN_CHAIN", "DATABASE_TLS_UNTRUSTED_CHAIN"],
    ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DATABASE_TLS_UNTRUSTED_CHAIN"],
    ["CERT_HAS_EXPIRED", "DATABASE_TLS_CERTIFICATE_EXPIRED"],
    ["ECONNREFUSED", "DATABASE_NETWORK_REFUSED"],
    ["ETIMEDOUT", "DATABASE_NETWORK_TIMEOUT"],
    ["ENETUNREACH", "DATABASE_NETWORK_UNREACHABLE"],
    ["ENOTFOUND", "DATABASE_DNS_FAILURE"],
  ] as const;

  for (const [code, expected] of cases) {
    const error = new Error("secret-bearing provider message") as Error & { code?: unknown };
    error.code = code;
    assert.equal(safeBootstrapDiagnosticCode(error), expected);
  }
});

test("maps only reviewed PostgreSQL SQLSTATE codes to fixed diagnostics", () => {
  const cases = [
    ["28P01", "DATABASE_AUTHENTICATION_FAILED"],
    ["28000", "DATABASE_AUTHENTICATION_FAILED"],
    ["42501", "DATABASE_PERMISSION_DENIED"],
    ["42P01", "DATABASE_SCHEMA_MISSING"],
    ["42883", "DATABASE_SCHEMA_MISSING"],
    ["3D000", "DATABASE_DATABASE_MISSING"],
    ["57P03", "DATABASE_NOT_READY"],
    ["53300", "DATABASE_CONNECTION_LIMIT"],
  ] as const;

  for (const [code, expected] of cases) {
    const error = new Error("postgresql://user:secret@example.invalid/db") as Error & { code?: unknown };
    error.code = code;
    assert.equal(safeBootstrapDiagnosticCode(error), expected);
  }
});

test("refuses arbitrary provider codes and preserves reviewed custom diagnostics", () => {
  const error = new Error("secret-message") as Error & { code?: unknown; diagnosticCode?: unknown };
  error.code = "SECRET_PROVIDER_VALUE";
  assert.equal(safeBootstrapDiagnosticCode(error), undefined);

  error.code = "28P01";
  error.diagnosticCode = "DATABASE_TLS_CA_UNREADABLE";
  assert.equal(safeBootstrapDiagnosticCode(error), "DATABASE_TLS_CA_UNREADABLE");
});
