import type {
  BehaviorRegressionBaseline,
  BehaviorRegressionDifference,
} from "../../../packages/contracts/behavior-baseline";
import type {
  BehaviorRegressionProposalSummary,
  BehaviorRegressionReport,
  BehaviorRegressionScenarioResult,
} from "../../../packages/contracts/behavior-regression";

export class BehaviorBaselineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BehaviorBaselineError";
  }
}

function proposalKey(proposal: BehaviorRegressionProposalSummary): string {
  return [
    proposal.destination,
    proposal.operation,
    proposal.state,
    proposal.proposedResultClass,
    proposal.userAction ?? "",
    proposal.canonicalEventType ?? "",
  ].join("|");
}

function proposalMultiset(proposals: BehaviorRegressionProposalSummary[]) {
  const counts = new Map<string, number>();
  for (const proposal of proposals) {
    const key = proposalKey(proposal);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function pushChanged(
  differences: BehaviorRegressionDifference[],
  scenarioId: string,
  path: string,
  expected: string | number,
  actual: string | number,
) {
  if (expected !== actual) differences.push({ scenarioId, path, kind: "CHANGED", expected, actual });
}

function compareScenario(
  expected: BehaviorRegressionScenarioResult,
  actual: BehaviorRegressionScenarioResult,
): BehaviorRegressionDifference[] {
  const differences: BehaviorRegressionDifference[] = [];

  pushChanged(differences, expected.scenarioId, "status", expected.status, actual.status);
  pushChanged(differences, expected.scenarioId, "proposalCount", expected.proposalCount, actual.proposalCount);
  pushChanged(
    differences,
    expected.scenarioId,
    "projectionEffectsStatus",
    expected.projectionEffectsStatus,
    actual.projectionEffectsStatus,
  );

  const expectedProposals = proposalMultiset(expected.proposals);
  const actualProposals = proposalMultiset(actual.proposals);
  const proposalKeys = new Set([...expectedProposals.keys(), ...actualProposals.keys()]);

  for (const key of [...proposalKeys].sort()) {
    const expectedCount = expectedProposals.get(key) ?? 0;
    const actualCount = actualProposals.get(key) ?? 0;
    if (expectedCount !== actualCount) {
      differences.push({
        scenarioId: expected.scenarioId,
        path: `proposals[${key}]`,
        kind: "CHANGED",
        expected: expectedCount,
        actual: actualCount,
      });
    }
  }

  return differences;
}

export function compareBehaviorBaseline(
  baseline: BehaviorRegressionBaseline,
  report: BehaviorRegressionReport,
): BehaviorRegressionDifference[] {
  if (baseline.baselineVersion !== 1) {
    throw new BehaviorBaselineError(`Unsupported behavior baseline version ${String(baseline.baselineVersion)}`);
  }
  if (report.schemaVersion !== 1) {
    throw new BehaviorBaselineError(`Unsupported behavior report schema version ${String(report.schemaVersion)}`);
  }
  if (!baseline.canonicalArtifact.trim()) {
    throw new BehaviorBaselineError("canonicalArtifact is required on a behavior baseline");
  }

  const baselineById = new Map<string, BehaviorRegressionScenarioResult>();
  for (const scenario of baseline.scenarios) {
    if (baselineById.has(scenario.scenarioId)) {
      throw new BehaviorBaselineError(`Duplicate baseline scenario ${scenario.scenarioId}`);
    }
    baselineById.set(scenario.scenarioId, scenario);
  }

  const reportById = new Map<string, BehaviorRegressionScenarioResult>();
  for (const scenario of report.scenarios) {
    if (reportById.has(scenario.scenarioId)) {
      throw new BehaviorBaselineError(`Duplicate report scenario ${scenario.scenarioId}`);
    }
    reportById.set(scenario.scenarioId, scenario);
  }

  const differences: BehaviorRegressionDifference[] = [];
  const scenarioIds = new Set([...baselineById.keys(), ...reportById.keys()]);

  for (const scenarioId of [...scenarioIds].sort()) {
    const expected = baselineById.get(scenarioId);
    const actual = reportById.get(scenarioId);

    if (!expected && actual) {
      differences.push({ scenarioId, path: "scenario", kind: "ADDED" });
      continue;
    }
    if (expected && !actual) {
      differences.push({ scenarioId, path: "scenario", kind: "REMOVED" });
      continue;
    }
    if (expected && actual) differences.push(...compareScenario(expected, actual));
  }

  return differences;
}
