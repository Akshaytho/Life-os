import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";

const gitCommitShaPattern = /^[0-9a-f]{40}$/;

/**
 * Production approval is pinned to one exact reviewed release. A persistent boolean
 * would silently authorize later deployments; matching the provider-reported commit
 * makes every production release an explicit, reviewable operator decision.
 */
export function productionReleaseApprovedForRuntime(
  env: NodeJS.ProcessEnv,
  provenance: RuntimeProvenance,
): boolean {
  if (provenance.environment !== "production") return true;

  const deployedRelease = provenance.releaseSha.trim().toLowerCase();
  const approvedRelease = env.LIFE_OS_PRODUCTION_RELEASE_SHA?.trim().toLowerCase();

  return (
    gitCommitShaPattern.test(deployedRelease)
    && approvedRelease !== undefined
    && gitCommitShaPattern.test(approvedRelease)
    && approvedRelease === deployedRelease
  );
}
