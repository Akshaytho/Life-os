import type {
  TechnicalTelemetryEvent,
  TechnicalTraceReferences,
} from "../../../packages/contracts/technical-telemetry";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";

export class TechnicalTelemetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TechnicalTelemetryError";
  }
}

export interface TechnicalTelemetrySink {
  emit(event: TechnicalTelemetryEvent): void;
}

export type TechnicalTelemetryLineWriter = (line: string) => void;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const errorCodePattern = /^[A-Z0-9][A-Z0-9_.:-]{0,99}$/;

function requireTimestamp(value: string) {
  if (!Number.isFinite(Date.parse(value))) throw new TechnicalTelemetryError("telemetry timestamp must be valid ISO-compatible time");
}

function safeIdentifier(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (!identifierPattern.test(value)) throw new TechnicalTelemetryError(`${label} must be an opaque technical identifier`);
  return value;
}

function safeErrorCode(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!errorCodePattern.test(value)) {
    throw new TechnicalTelemetryError("errorCode must be a stable machine code, not an error message");
  }
  return value;
}

function safeDuration(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 86_400_000) {
    throw new TechnicalTelemetryError("durationMs must be a finite non-negative duration");
  }
  return Math.round(value);
}

function safeRuntime(runtime: RuntimeProvenance) {
  return {
    environment: runtime.environment,
    releaseSha: safeIdentifier(runtime.releaseSha, "runtime.releaseSha")!,
    deploymentId: safeIdentifier(runtime.deploymentId, "runtime.deploymentId"),
    serviceName: safeIdentifier(runtime.serviceName, "runtime.serviceName"),
    platform: runtime.platform,
  };
}

function safeTrace(trace: TechnicalTraceReferences | undefined) {
  if (!trace) return undefined;
  const result = {
    correlationId: safeIdentifier(trace.correlationId, "trace.correlationId"),
    requestId: safeIdentifier(trace.requestId, "trace.requestId"),
    captureId: safeIdentifier(trace.captureId, "trace.captureId"),
    proposalId: safeIdentifier(trace.proposalId, "trace.proposalId"),
    eventId: safeIdentifier(trace.eventId, "trace.eventId"),
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

/**
 * Rebuilds the output from the typed allow-list instead of serializing the caller's
 * object wholesale. Unknown runtime properties cannot leak through JSON.stringify.
 */
export function serializeTechnicalTelemetry(event: TechnicalTelemetryEvent): string {
  requireTimestamp(event.timestamp);

  const base = {
    timestamp: new Date(event.timestamp).toISOString(),
    level: event.level,
    component: event.component,
    runtime: safeRuntime(event.runtime),
  };

  if (event.kind === "RUNTIME_LIFECYCLE") {
    return JSON.stringify({
      ...base,
      kind: event.kind,
      event: event.event,
      signal: event.signal,
      errorCode: safeErrorCode(event.errorCode),
    });
  }

  if (event.kind === "OPERATION") {
    return JSON.stringify({
      ...base,
      kind: event.kind,
      operation: event.operation,
      outcome: event.outcome,
      durationMs: safeDuration(event.durationMs),
      trace: safeTrace(event.trace),
      errorCode: safeErrorCode(event.errorCode),
    });
  }

  return JSON.stringify({
    ...base,
    kind: event.kind,
    interpreter: event.interpreter,
    outcome: event.outcome,
    proposalCount: event.proposalCount,
    confidenceBand: event.confidenceBand,
    durationMs: safeDuration(event.durationMs),
    trace: safeTrace(event.trace),
    policyVersion: safeIdentifier(event.policyVersion, "policyVersion"),
    modelName: safeIdentifier(event.modelName, "modelName"),
    errorCode: safeErrorCode(event.errorCode),
  });
}

export function createConsoleTechnicalTelemetrySink(
  writer: TechnicalTelemetryLineWriter = (line) => console.info(line),
): TechnicalTelemetrySink {
  return {
    emit(event) {
      writer(serializeTechnicalTelemetry(event));
    },
  };
}
