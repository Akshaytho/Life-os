import assert from "node:assert/strict";
import test from "node:test";
import type { InteractionChangeTrace } from "../../../packages/contracts/interaction-change-ledger";
import { buildBehaviorRegressionReport, summarizeBehaviorScenario, BehaviorRegressionReportError } from "./behavior-regression-report";

function trace(): InteractionChangeTrace {
  return {
    captureId: "capture-private-1",
    correlationId: "capture-private-1",
    status: "COMMITTED",
    source: {
      authorityClass: "USER_SOURCE",
      actorType: "USER",
      text: "my private synthetic sentence must never enter the report",
      occurredAt: "2026-08-13T04:00:00.000Z",
      recordedAt: "2026-08-13T04:00:01.000Z",
      source: "WEB_APP",
    },
    interpretation: {
      authorityClass: "OBSERVATION",
      actorType: "LIFE_OS_AI",
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "CONFIRMED",
      confidence: 0.95,
      observations: [
        { id: "private", label: "Private", value: "private interpretation prose", trustClass: "OBSERVATION" },
      ],
      createdAt: "2026-08-13T04:00:02.000Z",
    },
    proposals: [
      {
        proposalId: "proposal-private-1",
        authorityClass: "SUGGESTION",
        proposedResultClass: "FACT",
        destination: "CALENDAR",
        operation: "CREATE_CALENDAR_PLAN",
        approvalMode: "REVIEW_AND_APPLY",
        state: "APPLIED",
        summary: "private proposal summary",
        reason: "private proposal reason",
        createdAt: "2026-08-13T04:00:02.000Z",
        userAction: {
          authorityClass: "DECISION",
          action: "APPROVED",
          actorType: "USER",
          actorId: "private-user-id",
          at: "2026-08-13T04:01:00.000Z",
          recordedAt: "2026-08-13T04:01:01.000Z",
        },
        canonicalChange: {
          resultClass: "FACT",
          eventId: "event-private-1",
          eventType: "CALENDAR_EVENT_CREATED",
          entityType: "calendar_event",
          entityId: "calendar-private-1",
          actorType: "USER",
          actorId: "private-user-id",
          source: "WEB_APP",
          occurredAt: "2026-08-13T04:01:00.000Z",
          recordedAt: "2026-08-13T04:01:01.000Z",
          summary: "private canonical summary",
          details: { title: "private title" },
        },
      },
    ],
    projectionEffects: { status: "NOT_RECORDED_YET", items: [] },
  };
}

test("scenario summary retains behavior shape but drops source, prose, IDs and payload details", () => {
  const summary = summarizeBehaviorScenario("confirmed-calendar-approve", trace());
  assert.deepEqual(summary, {
    scenarioId: "confirmed-calendar-approve",
    status: "COMMITTED",
    proposalCount: 1,
    proposals: [{
      destination: "CALENDAR",
      operation: "CREATE_CALENDAR_PLAN",
      state: "APPLIED",
      proposedResultClass: "FACT",
      userAction: "APPROVED",
      canonicalEventType: "CALENDAR_EVENT_CREATED",
    }],
    projectionEffectsStatus: "NOT_RECORDED_YET",
  });

  const serialized = JSON.stringify(summary);
  for (const privateValue of [
    "my private synthetic sentence",
    "private interpretation prose",
    "private proposal summary",
    "private proposal reason",
    "private-user-id",
    "capture-private-1",
    "proposal-private-1",
    "event-private-1",
    "private title",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("report includes only release-level runtime provenance", () => {
  const report = buildBehaviorRegressionReport({
    environment: "ci",
    releaseSha: "release-123",
    deploymentId: "deployment-should-not-enter-report",
    serviceName: "service-should-not-enter-report",
    platform: "CI",
  }, "2026-08-13T04:05:00.000Z", [summarizeBehaviorScenario("confirmed-calendar-approve", trace())]);

  assert.deepEqual(report.runtime, {
    environment: "ci",
    releaseSha: "release-123",
    platform: "CI",
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("deployment-should-not-enter-report"), false);
  assert.equal(serialized.includes("service-should-not-enter-report"), false);
});

test("scenario IDs must be stable technical labels rather than prose", () => {
  assert.throws(
    () => summarizeBehaviorScenario("I am worried about work", trace()),
    (error: unknown) => error instanceof BehaviorRegressionReportError && /stable lowercase technical identifier/.test(error.message),
  );
});

test("duplicate scenario IDs are rejected", () => {
  const scenario = summarizeBehaviorScenario("confirmed-calendar-approve", trace());
  assert.throws(
    () => buildBehaviorRegressionReport({ environment: "ci", releaseSha: "release", platform: "CI" }, new Date().toISOString(), [scenario, scenario]),
    (error: unknown) => error instanceof BehaviorRegressionReportError && /duplicate behavior scenario/.test(error.message),
  );
});
