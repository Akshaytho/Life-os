const safeErrorClassPattern = /^[A-Za-z][A-Za-z0-9]*Error$/;

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
