import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import { ApiRuntimeConfigurationError, privateApiEnabledForRuntime } from "./api-runtime";
import { resolveRuntimeProvenance } from "./runtime-provenance";

function optionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function periodicReviewsEnabledForRuntime(
  env: NodeJS.ProcessEnv,
  provenance: RuntimeProvenance = resolveRuntimeProvenance(env),
): boolean {
  const value = optionalText(env.LIFE_OS_PERIODIC_REVIEWS_ENABLED)?.toLowerCase();
  if (value === undefined || value === "false") return false;
  if (value !== "true") {
    throw new ApiRuntimeConfigurationError("LIFE_OS_PERIODIC_REVIEWS_ENABLED must be true or false");
  }
  if (!privateApiEnabledForRuntime(env, provenance)) {
    throw new ApiRuntimeConfigurationError(
      "LIFE_OS_PERIODIC_REVIEWS_ENABLED requires LIFE_OS_PRIVATE_API_ENABLED=true",
    );
  }
  const dependencies = [
    "LIFE_OS_DAILY_RETURN_ENABLED",
    "LIFE_OS_BRAIN_DUMP_NOT_NOW_ENABLED",
    "LIFE_OS_DRIFT_RETURN_ENABLED",
    "LIFE_OS_JOURNEY_PRACTICE_ENABLED",
  ];
  const missing = dependencies.filter((name) => optionalText(env[name])?.toLowerCase() !== "true");
  if (missing.length > 0) {
    throw new ApiRuntimeConfigurationError(
      `LIFE_OS_PERIODIC_REVIEWS_ENABLED requires reviewed source capabilities: ${missing.join(", ")}`,
    );
  }
  return true;
}
