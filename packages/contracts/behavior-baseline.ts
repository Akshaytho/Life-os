import type { BehaviorRegressionScenarioResult } from "./behavior-regression";

export interface BehaviorRegressionBaseline {
  baselineVersion: 1;
  canonicalArtifact: string;
  scenarios: BehaviorRegressionScenarioResult[];
}

export interface BehaviorRegressionDifference {
  scenarioId: string;
  path: string;
  kind: "ADDED" | "REMOVED" | "CHANGED";
  expected?: string | number;
  actual?: string | number;
}
