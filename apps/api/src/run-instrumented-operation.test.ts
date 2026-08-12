import assert from "node:assert/strict";
import test from "node:test";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import { runInstrumentedOperation } from "./run-instrumented-operation";

const runtime = {
  environment: "ci" as const,
  releaseSha: "release-1",
  platform: "CI" as const,
};

function timer(values: number[], iso = "2026-08-13T05:00:00.000Z") {
  let index = 0;
  return {
    nowMs() {
      const value = values[Math.min(index, values.length - 1)];
      index += 1;
      return value;
    },
    nowIso() {
      return iso;
    },
  };
}

test("successful operation emits only opaque references and returns the original value", async () => {
  const events: TechnicalTelemetryEvent[] = [];
  const privateCommand = { rawText: "my private life sentence", payloadJson: { secret: "private" } };

  const value = await runInstrumentedOperation({
    operation: "CAPTURE_AND_PROPOSE",
    runtime,
    telemetry: { emit(event) { events.push(event); } },
    timer: timer([100, 112]),
    initialTrace: { requestId: "request-1" },
    async work() {
      assert.equal(privateCommand.rawText, "my private life sentence");
      return {
        value: { captureId: "capture-1", privateEcho: privateCommand.rawText },
        trace: { captureId: "capture-1", correlationId: "capture-1" },
      };
    },
  });

  assert.deepEqual(value, { captureId: "capture-1", privateEcho: "my private life sentence" });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    timestamp: "2026-08-13T05:00:00.000Z",
    level: "INFO",
    component: "APPLICATION",
    runtime,
    kind: "OPERATION",
    operation: "CAPTURE_AND_PROPOSE",
    outcome: "SUCCESS",
    durationMs: 12,
    trace: {
      requestId: "request-1",
      captureId: "capture-1",
      correlationId: "capture-1",
    },
  });
  assert.equal(JSON.stringify(events[0]).includes("my private life sentence"), false);
  assert.equal(JSON.stringify(events[0]).includes("private"), false);
});

test("classified business rejection emits machine outcome then rethrows the original error", async () => {
  const events: TechnicalTelemetryEvent[] = [];
  const original = new Error("user-specific private failure detail");

  await assert.rejects(
    () => runInstrumentedOperation({
      operation: "APPLY_CALENDAR_PROPOSAL",
      runtime,
      telemetry: { emit(event) { events.push(event); } },
      timer: timer([10, 17]),
      initialTrace: { proposalId: "proposal-1" },
      async work() {
        throw original;
      },
      classifyFailure(error) {
        assert.equal(error, original);
        return {
          outcome: "REJECTED",
          errorCode: "PROPOSAL_NOT_APPLICABLE",
        };
      },
    }),
    (error: unknown) => error === original,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "OPERATION");
  if (events[0].kind !== "OPERATION") throw new Error("Expected operation telemetry");
  assert.equal(events[0].outcome, "REJECTED");
  assert.equal(events[0].errorCode, "PROPOSAL_NOT_APPLICABLE");
  assert.equal(events[0].level, "WARN");
  assert.equal(JSON.stringify(events[0]).includes(original.message), false);
});

test("unclassified failure emits a stable generic code without exception text", async () => {
  const events: TechnicalTelemetryEvent[] = [];
  const original = new Error("postgresql://user:password@private-host/db");

  await assert.rejects(
    () => runInstrumentedOperation({
      operation: "DATABASE_TRANSACTION",
      runtime,
      telemetry: { emit(event) { events.push(event); } },
      timer: timer([1, 6]),
      async work() {
        throw original;
      },
    }),
    (error: unknown) => error === original,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "OPERATION");
  if (events[0].kind !== "OPERATION") throw new Error("Expected operation telemetry");
  assert.equal(events[0].outcome, "FAILED");
  assert.equal(events[0].errorCode, "UNCLASSIFIED_OPERATION_FAILURE");
  assert.equal(events[0].level, "ERROR");
  assert.equal(JSON.stringify(events[0]).includes("password"), false);
  assert.equal(JSON.stringify(events[0]).includes("private-host"), false);
});

test("telemetry sink failure cannot convert an application success into failure", async () => {
  const result = await runInstrumentedOperation({
    operation: "GET_INTERACTION_TRACE",
    runtime,
    telemetry: { emit() { throw new Error("telemetry unavailable"); } },
    timer: timer([100, 101]),
    async work() {
      return { value: "application-result" };
    },
  });

  assert.equal(result, "application-result");
});

test("telemetry sink failure cannot replace the original application error", async () => {
  const original = new Error("original product failure");

  await assert.rejects(
    () => runInstrumentedOperation({
      operation: "GET_PROPOSAL_REVIEW",
      runtime,
      telemetry: { emit() { throw new Error("telemetry failure"); } },
      timer: timer([100, 101]),
      async work() {
        throw original;
      },
    }),
    (error: unknown) => error === original,
  );
});

test("operation work can report REJECTED as a successful no-write business outcome", async () => {
  const events: TechnicalTelemetryEvent[] = [];
  const result = await runInstrumentedOperation({
    operation: "REJECT_ROUTING_PROPOSAL",
    runtime,
    telemetry: { emit(event) { events.push(event); } },
    timer: timer([20, 24]),
    initialTrace: { proposalId: "proposal-1" },
    async work() {
      return {
        value: { state: "REJECTED" },
        outcome: "REJECTED",
      };
    },
  });

  assert.deepEqual(result, { state: "REJECTED" });
  assert.equal(events[0].kind, "OPERATION");
  if (events[0].kind !== "OPERATION") throw new Error("Expected operation telemetry");
  assert.equal(events[0].outcome, "REJECTED");
  assert.equal(events[0].level, "INFO");
});
