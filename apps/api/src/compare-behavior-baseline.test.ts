import assert from "node:assert/strict";
import test from "node:test";
import type { BehaviorRegressionBaseline } from "../../../packages/contracts/behavior-baseline";
import type { BehaviorRegressionReport } from "../../../packages/contracts/behavior-regression";
import { BehaviorBaselineError, compareBehaviorBaseline } from "./compare-behavior-baseline";

function baseline(): BehaviorRegressionBaseline {
  return {
    baselineVersion: 1,
    canonicalArtifact: "LIFE-OS-CANON-001@1.2.0",
    scenarios: [
      {
        scenarioId: "multi-owner-example",
        status: "PARTIALLY_COMMITTED",
        proposalCount: 2,
        proposals: [
          {
            destination: "CALENDAR",
            operation: "CREATE_CALENDAR_PLAN",
            state: "APPLIED",
            proposedResultClass: "FACT",
            userAction: "APPROVED",
            canonicalEventType: "CALENDAR_EVENT_CREATED",
          },
          {
            destination: "YOU",
            operation: "RECORD_DECISION",
            state: "NEEDS_CONFIRMATION",
            proposedResultClass: "DECISION",
          },
        ],
        projectionEffectsStatus: "NOT_RECORDED_YET",
      },
    ],
  };
}

function report(): BehaviorRegressionReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-13T05:30:00.000Z",
    runtime: { environment: "ci", releaseSha: "release-1", platform: "CI" },
    scenarios: baseline().scenarios.map((item) => structuredClone(item)),
  };
}

test("identical semantic behavior has no differences even if proposal order changes", () => {
  const actual = report();
  actual.scenarios[0].proposals.reverse();

  assert.deepEqual(compareBehaviorBaseline(baseline(), actual), []);
});

test("status and proposal semantics produce explicit differences", () => {
  const actual = report();
  actual.scenarios[0].status = "COMMITTED";
  actual.scenarios[0].proposals[1].state = "APPLIED";
  actual.scenarios[0].proposals[1].userAction = "APPROVED";

  const differences = compareBehaviorBaseline(baseline(), actual);
  assert.equal(differences.some((item) => item.path === "status" && item.expected === "PARTIALLY_COMMITTED" && item.actual === "COMMITTED"), true);
  assert.equal(differences.some((item) => item.path.startsWith("proposals[") && item.kind === "CHANGED"), true);
});

test("added and removed scenarios are visible", () => {
  const actual = report();
  actual.scenarios = [{
    scenarioId: "new-scenario",
    status: "AWAITING_REVIEW",
    proposalCount: 0,
    proposals: [],
    projectionEffectsStatus: "NOT_RECORDED_YET",
  }];

  assert.deepEqual(compareBehaviorBaseline(baseline(), actual), [
    { scenarioId: "multi-owner-example", path: "scenario", kind: "REMOVED" },
    { scenarioId: "new-scenario", path: "scenario", kind: "ADDED" },
  ]);
});

test("runtime release metadata is intentionally ignored by semantic comparison", () => {
  const actual = report();
  actual.runtime.releaseSha = "another-release";
  actual.generatedAt = "2027-01-01T00:00:00.000Z";

  assert.deepEqual(compareBehaviorBaseline(baseline(), actual), []);
});

test("duplicate scenario IDs fail rather than creating ambiguous comparisons", () => {
  const actual = report();
  actual.scenarios.push(structuredClone(actual.scenarios[0]));

  assert.throws(
    () => compareBehaviorBaseline(baseline(), actual),
    (error: unknown) => error instanceof BehaviorBaselineError && /Duplicate report scenario/.test(error.message),
  );
});

test("baseline must identify the canonical artifact it was reviewed against", () => {
  const expected = baseline();
  expected.canonicalArtifact = "";

  assert.throws(
    () => compareBehaviorBaseline(expected, report()),
    (error: unknown) => error instanceof BehaviorBaselineError && /canonicalArtifact is required/.test(error.message),
  );
});
