import assert from "node:assert/strict";
import test from "node:test";
import type { OperationTelemetry } from "../../../packages/contracts/technical-telemetry";
import { createConsoleTechnicalTelemetrySink, serializeTechnicalTelemetry, TechnicalTelemetryError } from "./technical-telemetry";

const runtime = {
  environment: "development" as const,
  releaseSha: "abc123",
  deploymentId: "deploy-42",
  serviceName: "life-os-api",
  platform: "RAILWAY" as const,
};

test("operation telemetry emits only typed technical references and outcome", () => {
  const event: OperationTelemetry = {
    timestamp: "2026-08-13T03:45:00.000Z",
    level: "INFO",
    component: "APPLICATION",
    runtime,
    kind: "OPERATION",
    operation: "CAPTURE_AND_PROPOSE",
    outcome: "SUCCESS",
    durationMs: 12.6,
    trace: {
      correlationId: "capture-123",
      requestId: "request-123",
      captureId: "capture-123",
      proposalId: "proposal-123",
    },
  };

  assert.deepEqual(JSON.parse(serializeTechnicalTelemetry(event)), {
    timestamp: "2026-08-13T03:45:00.000Z",
    level: "INFO",
    component: "APPLICATION",
    runtime: {
      environment: "development",
      releaseSha: "abc123",
      deploymentId: "deploy-42",
      serviceName: "life-os-api",
      platform: "RAILWAY",
    },
    kind: "OPERATION",
    operation: "CAPTURE_AND_PROPOSE",
    outcome: "SUCCESS",
    durationMs: 13,
    trace: {
      correlationId: "capture-123",
      requestId: "request-123",
      captureId: "capture-123",
      proposalId: "proposal-123",
    },
  });
});

test("unknown properties cannot leak even when untyped runtime input carries private values", () => {
  const malicious = {
    timestamp: "2026-08-13T03:45:00.000Z",
    level: "INFO",
    component: "APPLICATION",
    runtime: {
      ...runtime,
      databaseUrl: "postgresql://secret:password@hidden/db",
      serviceRoleKey: "private-service-key",
    },
    kind: "OPERATION",
    operation: "GET_INTERACTION_TRACE",
    outcome: "SUCCESS",
    durationMs: 4,
    rawText: "my private life sentence",
    payloadJson: { secret: "private payload" },
    errorMessage: "provider leaked a secret",
    trace: { captureId: "capture-1" },
  } as unknown as OperationTelemetry;

  const serialized = serializeTechnicalTelemetry(malicious);
  for (const privateValue of [
    "secret:password",
    "private-service-key",
    "my private life sentence",
    "private payload",
    "provider leaked a secret",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("free-form error messages are rejected as error codes", () => {
  assert.throws(
    () => serializeTechnicalTelemetry({
      timestamp: "2026-08-13T03:45:00.000Z",
      level: "ERROR",
      component: "DATABASE",
      runtime,
      kind: "OPERATION",
      operation: "DATABASE_TRANSACTION",
      outcome: "FAILED",
      durationMs: 3,
      errorCode: "password authentication failed for user private_user",
    }),
    (error: unknown) => error instanceof TechnicalTelemetryError && /stable machine code/.test(error.message),
  );
});

test("trace references must look like opaque technical identifiers rather than arbitrary prose", () => {
  assert.throws(
    () => serializeTechnicalTelemetry({
      timestamp: "2026-08-13T03:45:00.000Z",
      level: "INFO",
      component: "APPLICATION",
      runtime,
      kind: "OPERATION",
      operation: "CAPTURE_AND_PROPOSE",
      outcome: "SUCCESS",
      durationMs: 2,
      trace: { captureId: "I feel bad about work today" },
    }),
    (error: unknown) => error instanceof TechnicalTelemetryError && /opaque technical identifier/.test(error.message),
  );
});

test("console sink writes one safe JSON line through the provided writer", () => {
  const lines: string[] = [];
  const sink = createConsoleTechnicalTelemetrySink((line) => lines.push(line));

  sink.emit({
    timestamp: "2026-08-13T03:45:00.000Z",
    level: "INFO",
    component: "API",
    runtime,
    kind: "RUNTIME_LIFECYCLE",
    event: "STARTED",
  });

  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).event, "STARTED");
});
