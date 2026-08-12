import type { LifeOsEnvironment, RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";

export class RuntimeProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeProvenanceError";
  }
}

const environments = new Set<LifeOsEnvironment>(["local", "ci", "development", "production"]);

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function requiredEnvironment(value: string | undefined): LifeOsEnvironment {
  const normalized = optionalText(value) ?? "local";
  if (!environments.has(normalized as LifeOsEnvironment)) {
    throw new RuntimeProvenanceError(`Unsupported LIFE_OS_ENVIRONMENT: ${normalized}`);
  }
  return normalized as LifeOsEnvironment;
}

function releaseSha(env: NodeJS.ProcessEnv, environment: LifeOsEnvironment): string {
  const value = optionalText(env.LIFE_OS_RELEASE_SHA)
    ?? optionalText(env.RAILWAY_GIT_COMMIT_SHA)
    ?? optionalText(env.GITHUB_SHA);

  if (value) return value;
  if (environment === "local") return "local-unversioned";

  throw new RuntimeProvenanceError(`A release SHA is required in ${environment}`);
}

function platform(env: NodeJS.ProcessEnv, environment: LifeOsEnvironment): RuntimeProvenance["platform"] {
  if (optionalText(env.RAILWAY_DEPLOYMENT_ID) || optionalText(env.RAILWAY_SERVICE_ID)) return "RAILWAY";
  if (environment === "ci" || optionalText(env.GITHUB_ACTIONS) === "true") return "CI";
  if (environment === "local") return "LOCAL";
  return "OTHER";
}

/**
 * Reads only an explicit allow-list of non-secret environment metadata.
 * Never serialize or return process.env wholesale from application code.
 */
export function resolveRuntimeProvenance(env: NodeJS.ProcessEnv = process.env): RuntimeProvenance {
  const environment = requiredEnvironment(env.LIFE_OS_ENVIRONMENT);

  return {
    environment,
    releaseSha: releaseSha(env, environment),
    deploymentId: optionalText(env.RAILWAY_DEPLOYMENT_ID),
    serviceName: optionalText(env.RAILWAY_SERVICE_NAME),
    platform: platform(env, environment),
  };
}
