import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import { ApiRuntimeConfigurationError, privateApiEnabledForRuntime } from "./api-runtime";
import { resolveRuntimeProvenance } from "./runtime-provenance";

function enabled(value: string | undefined) { return value?.trim().toLowerCase() }

export function memoryEnabledForRuntime(
  env: NodeJS.ProcessEnv,
  provenance: RuntimeProvenance = resolveRuntimeProvenance(env),
) {
  const value = enabled(env.LIFE_OS_MEMORY_ENABLED);
  if (value === undefined || value === "false") return false;
  if (value !== "true") throw new ApiRuntimeConfigurationError("LIFE_OS_MEMORY_ENABLED must be true or false");
  if (!privateApiEnabledForRuntime(env, provenance)) {
    throw new ApiRuntimeConfigurationError("LIFE_OS_MEMORY_ENABLED requires LIFE_OS_PRIVATE_API_ENABLED=true");
  }
  const dependencies = [
    "LIFE_OS_DIRECTION_ENABLED",
    "LIFE_OS_JOURNEY_PRACTICE_ENABLED",
    "LIFE_OS_PERIODIC_REVIEWS_ENABLED",
  ];
  const missing = dependencies.filter((name) => enabled(env[name]) !== "true");
  if (missing.length) {
    throw new ApiRuntimeConfigurationError(
      `LIFE_OS_MEMORY_ENABLED requires canonical source capabilities: ${missing.join(", ")}`,
    );
  }
  return true;
}
