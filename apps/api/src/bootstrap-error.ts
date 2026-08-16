const safeErrorClassPattern = /^[A-Za-z][A-Za-z0-9]*Error$/;
const safeDiagnosticCodePattern = /^[A-Z][A-Z0-9_]{2,63}$/;

interface DiagnosticErrorShape {
  diagnosticCode?: unknown;
  code?: unknown;
}

const providerDiagnosticCodeMap: Readonly<Record<string, string>> = {
  ERR_TLS_CERT_ALTNAME_INVALID: "DATABASE_TLS_HOSTNAME_MISMATCH",
  SELF_SIGNED_CERT_IN_CHAIN: "DATABASE_TLS_UNTRUSTED_CHAIN",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "DATABASE_TLS_UNTRUSTED_CHAIN",
  DEPTH_ZERO_SELF_SIGNED_CERT: "DATABASE_TLS_UNTRUSTED_CHAIN",
  CERT_HAS_EXPIRED: "DATABASE_TLS_CERTIFICATE_EXPIRED",
  ECONNREFUSED: "DATABASE_NETWORK_REFUSED",
  ETIMEDOUT: "DATABASE_NETWORK_TIMEOUT",
  ENETUNREACH: "DATABASE_NETWORK_UNREACHABLE",
  EHOSTUNREACH: "DATABASE_NETWORK_UNREACHABLE",
  ENOTFOUND: "DATABASE_DNS_FAILURE",
  EAI_AGAIN: "DATABASE_DNS_FAILURE",
  "28P01": "DATABASE_AUTHENTICATION_FAILED",
  "28000": "DATABASE_AUTHENTICATION_FAILED",
  "42501": "DATABASE_PERMISSION_DENIED",
  "42P01": "DATABASE_SCHEMA_MISSING",
  "42883": "DATABASE_SCHEMA_MISSING",
  "3D000": "DATABASE_DATABASE_MISSING",
  "57P03": "DATABASE_NOT_READY",
  "53300": "DATABASE_CONNECTION_LIMIT",
};

/**
 * Bootstrap diagnostics may reveal only a stable JavaScript/Error class name. Messages,
 * stacks and arbitrary custom names are deliberately excluded because provider/configuration
 * errors can contain connection details or other secret-bearing values.
 */
export function safeBootstrapErrorClass(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownBootstrapError";

  const name = error.name.trim();
  if (!safeErrorClassPattern.test(name)) return "UnknownBootstrapError";
  return name;
}

/**
 * A configuration boundary may optionally attach a fixed, non-secret diagnostic code.
 * Provider/library errors may expose their own `code`, but only exact values from the reviewed
 * allowlist above are translated into fixed Life OS diagnostics. Arbitrary provider values,
 * messages and stacks remain undisclosed.
 */
export function safeBootstrapDiagnosticCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;

  const shape = error as Error & DiagnosticErrorShape;
  const value = shape.diagnosticCode;
  if (typeof value === "string") {
    const code = value.trim();
    if (safeDiagnosticCodePattern.test(code)) return code;
  }

  if (typeof shape.code !== "string") return undefined;
  return providerDiagnosticCodeMap[shape.code.trim()];
}
