import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type { LifeOsAssistant } from "../../../packages/intelligence/life-os-assistant";
import { OpenAiLifeOsAssistant } from "../../../packages/intelligence/openai-life-os-assistant";
import { ApiRuntimeConfigurationError, privateApiEnabledForRuntime } from "./api-runtime";
import { resolveRuntimeProvenance } from "./runtime-provenance";

export interface AiRetrievalRuntimeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function requiredText(value: string | undefined, name: string): string {
  const normalized = optionalText(value);
  if (!normalized) {
    throw new ApiRuntimeConfigurationError(`${name} is required when Ask Life OS retrieval is enabled`);
  }
  return normalized;
}

export function aiRetrievalEnabledForRuntime(
  env: NodeJS.ProcessEnv,
  provenance: RuntimeProvenance = resolveRuntimeProvenance(env),
): boolean {
  const value = optionalText(env.LIFE_OS_AI_RETRIEVAL_ENABLED)?.toLowerCase();
  if (value === undefined || value === "false") return false;
  if (value !== "true") {
    throw new ApiRuntimeConfigurationError("LIFE_OS_AI_RETRIEVAL_ENABLED must be true or false");
  }
  if (!privateApiEnabledForRuntime(env, provenance)) {
    throw new ApiRuntimeConfigurationError(
      "LIFE_OS_AI_RETRIEVAL_ENABLED requires LIFE_OS_PRIVATE_API_ENABLED=true",
    );
  }
  return true;
}

export function createLifeOsAssistantFromEnv(
  env: NodeJS.ProcessEnv,
  provenance: RuntimeProvenance = resolveRuntimeProvenance(env),
  options: AiRetrievalRuntimeOptions = {},
): LifeOsAssistant | undefined {
  if (!aiRetrievalEnabledForRuntime(env, provenance)) return undefined;
  return new OpenAiLifeOsAssistant({
    apiKey: requiredText(env.OPENAI_API_KEY, "OPENAI_API_KEY"),
    model: requiredText(env.LIFE_OS_AI_RETRIEVAL_MODEL, "LIFE_OS_AI_RETRIEVAL_MODEL"),
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
}
