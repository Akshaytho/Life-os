import { readFile } from "node:fs/promises";
import type { BehaviorRegressionBaseline } from "../packages/contracts/behavior-baseline";
import type { BehaviorRegressionReport } from "../packages/contracts/behavior-regression";
import { compareBehaviorBaseline } from "../apps/api/src/compare-behavior-baseline";

const baselinePath = process.argv[2] ?? "tests/behavior/baseline-v1.json";
const reportPath = process.argv[3] ?? "artifacts/behavior-regression.json";

const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as BehaviorRegressionBaseline;
const report = JSON.parse(await readFile(reportPath, "utf8")) as BehaviorRegressionReport;
const differences = compareBehaviorBaseline(baseline, report);

if (differences.length > 0) {
  console.error(JSON.stringify({
    event: "BEHAVIOR_BASELINE_MISMATCH",
    canonicalArtifact: baseline.canonicalArtifact,
    differenceCount: differences.length,
    differences,
  }, null, 2));
  process.exitCode = 1;
} else {
  console.info(JSON.stringify({
    event: "BEHAVIOR_BASELINE_MATCH",
    canonicalArtifact: baseline.canonicalArtifact,
    scenarioCount: baseline.scenarios.length,
    releaseSha: report.runtime.releaseSha,
  }));
}
