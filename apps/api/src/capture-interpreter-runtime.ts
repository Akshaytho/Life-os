import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";
import { FailClosedCaptureInterpreter } from "../../../packages/intelligence/fail-closed-capture-interpreter";
import { OpenAiCaptureInterpreter } from "../../../packages/intelligence/openai-capture-interpreter";
import { SafeFallbackCaptureInterpreter } from "../../../packages/intelligence/safe-fallback-capture-interpreter";

export class CaptureInterpreterRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureInterpreterRuntimeConfigurationError";
  }
}

export interface CaptureInterpreterRuntimeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function enabled(value: string | undefined): boolean {
  const normalized = optionalText(value);
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new CaptureInterpreterRuntimeConfigurationError(
    "LIFE_OS_AI_INTERPRETER_ENABLED must be true or false when provided",
  );
}

function requiredText(value: string | undefined, name: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw new CaptureInterpreterRuntimeConfigurationError(`${name} is required when trusted AI interpretation is enabled`);
  return normalized;
}

/**
 * AI interpretation is an explicit runtime capability, never an implicit side
 * effect of having an API key present. Disabled/missing flag preserves the exact
 * SafeFallback behavior. Enabled mode requires an explicit model choice and wraps
 * provider/model failure in the same fail-closed fallback.
 */
export function createCaptureInterpreterFromEnv(
  env: NodeJS.ProcessEnv,
  options: CaptureInterpreterRuntimeOptions = {},
): CaptureInterpreter {
  const fallback = new SafeFallbackCaptureInterpreter();
  if (!enabled(env.LIFE_OS_AI_INTERPRETER_ENABLED)) return fallback;

  const primary = new OpenAiCaptureInterpreter({
    apiKey: requiredText(env.OPENAI_API_KEY, "OPENAI_API_KEY"),
    model: requiredText(env.LIFE_OS_AI_MODEL, "LIFE_OS_AI_MODEL"),
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  return new FailClosedCaptureInterpreter(primary, fallback);
}
