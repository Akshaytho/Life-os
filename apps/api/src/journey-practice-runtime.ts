import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import { ApiRuntimeConfigurationError, privateApiEnabledForRuntime } from "./api-runtime";
import { resolveRuntimeProvenance } from "./runtime-provenance";

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function journeyPracticeEnabledForRuntime(
  env: NodeJS.ProcessEnv,
  provenance: RuntimeProvenance = resolveRuntimeProvenance(env),
): boolean {
  const value = optionalText(env.LIFE_OS_JOURNEY_PRACTICE_ENABLED)?.toLowerCase();
  if (value === undefined || value === "false") return false;
  if (value !== "true") {
    throw new ApiRuntimeConfigurationError("LIFE_OS_JOURNEY_PRACTICE_ENABLED must be true or false");
  }
  if (!privateApiEnabledForRuntime(env, provenance)) {
    throw new ApiRuntimeConfigurationError(
      "LIFE_OS_JOURNEY_PRACTICE_ENABLED requires LIFE_OS_PRIVATE_API_ENABLED=true",
    );
  }
  return true;
}
