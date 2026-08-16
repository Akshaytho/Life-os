const safeErrorClassPattern = /^[A-Za-z][A-Za-z0-9]*Error$/;
const safeDiagnosticCodePattern = /^[A-Z][A-Z0-9_]{2,63}$/;

interface DiagnosticErrorShape {
  diagnosticCode?: unknown;
}

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
 * Only a strict uppercase token is allowed through; arbitrary values are discarded.
 */
export function safeBootstrapDiagnosticCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;

  const value = (error as Error & DiagnosticErrorShape).diagnosticCode;
  if (typeof value !== "string") return undefined;
  const code = value.trim();
  return safeDiagnosticCodePattern.test(code) ? code : undefined;
}
