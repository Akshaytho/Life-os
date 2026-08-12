import type {
  BehaviorRegressionReport,
  BehaviorRegressionScenarioResult,
} from "../../../packages/contracts/behavior-regression";
import type { InteractionChangeTrace } from "../../../packages/contracts/interaction-change-ledger";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";

export class BehaviorRegressionReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BehaviorRegressionReportError";
  }
}

const scenarioPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function summarizeBehaviorScenario(
  scenarioId: string,
  trace: InteractionChangeTrace,
): BehaviorRegressionScenarioResult {
  if (!scenarioPattern.test(scenarioId)) {
    throw new BehaviorRegressionReportError("scenarioId must be a stable lowercase technical identifier");
  }

  return {
    scenarioId,
    status: trace.status,
    proposalCount: trace.proposals.length,
    proposals: trace.proposals.map((proposal) => ({
      destination: proposal.destination,
      operation: proposal.operation,
      state: proposal.state,
      proposedResultClass: proposal.proposedResultClass,
      userAction: proposal.userAction?.action,
      canonicalEventType: proposal.canonicalChange?.eventType,
    })),
    projectionEffectsStatus: trace.projectionEffects.status,
  };
}

export function buildBehaviorRegressionReport(
  runtime: RuntimeProvenance,
  generatedAt: string,
  scenarios: BehaviorRegressionScenarioResult[],
): BehaviorRegressionReport {
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new BehaviorRegressionReportError("generatedAt must be valid ISO-compatible time");
  }
  if (scenarios.length === 0) {
    throw new BehaviorRegressionReportError("at least one behavior scenario is required");
  }

  const ids = new Set<string>();
  for (const scenario of scenarios) {
    if (ids.has(scenario.scenarioId)) {
      throw new BehaviorRegressionReportError(`duplicate behavior scenario ${scenario.scenarioId}`);
    }
    ids.add(scenario.scenarioId);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date(generatedAt).toISOString(),
    runtime: {
      environment: runtime.environment,
      releaseSha: runtime.releaseSha,
      platform: runtime.platform,
    },
    scenarios,
  };
}
