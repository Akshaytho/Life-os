import type {
  OperationTelemetry,
  TechnicalOperation,
  TechnicalTraceReferences,
} from "../../../packages/contracts/technical-telemetry";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type { TechnicalTelemetrySink } from "./technical-telemetry";

export type InstrumentedOperationOutcome = OperationTelemetry["outcome"];

export interface OperationTimer {
  nowMs(): number;
  nowIso(): string;
}

export interface InstrumentedOperationResult<T> {
  value: T;
  outcome?: Exclude<InstrumentedOperationOutcome, "FAILED">;
  trace?: TechnicalTraceReferences;
}

export interface InstrumentedOperationFailure {
  outcome: Exclude<InstrumentedOperationOutcome, "SUCCESS">;
  errorCode: string;
  trace?: TechnicalTraceReferences;
}

export interface RunInstrumentedOperationOptions<T> {
  operation: TechnicalOperation;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  timer: OperationTimer;
  initialTrace?: TechnicalTraceReferences;
  work(): Promise<InstrumentedOperationResult<T>>;
  classifyFailure?(error: unknown): InstrumentedOperationFailure;
}

function mergeTrace(
  initial: TechnicalTraceReferences | undefined,
  final: TechnicalTraceReferences | undefined,
): TechnicalTraceReferences | undefined {
  if (!initial && !final) return undefined;
  return { ...initial, ...final };
}

/**
 * Observes an application operation without receiving its command/request payload.
 *
 * Privacy is structural: this wrapper only accepts the small TechnicalTraceReferences
 * shape. Callers execute raw/private work inside the closure, where it never becomes an
 * input to the telemetry serializer.
 *
 * Telemetry emission is best-effort and must never change the application operation's
 * success/failure semantics. Sink failures are swallowed intentionally; production
 * monitoring of a broken telemetry sink is a separate operational concern.
 */
export async function runInstrumentedOperation<T>(
  options: RunInstrumentedOperationOptions<T>,
): Promise<T> {
  const startedAt = options.timer.nowMs();

  try {
    const result = await options.work();
    const event: OperationTelemetry = {
      timestamp: options.timer.nowIso(),
      level: "INFO",
      component: "APPLICATION",
      runtime: options.runtime,
      kind: "OPERATION",
      operation: options.operation,
      outcome: result.outcome ?? "SUCCESS",
      durationMs: Math.max(0, options.timer.nowMs() - startedAt),
      trace: mergeTrace(options.initialTrace, result.trace),
    };

    try {
      options.telemetry.emit(event);
    } catch {
      // The product operation already succeeded. Observability is not allowed to
      // retroactively turn that success into a user-facing failure.
    }

    return result.value;
  } catch (error) {
    const failure = options.classifyFailure?.(error) ?? {
      outcome: "FAILED" as const,
      errorCode: "UNCLASSIFIED_OPERATION_FAILURE",
    };

    const event: OperationTelemetry = {
      timestamp: options.timer.nowIso(),
      level: failure.outcome === "FAILED" ? "ERROR" : "WARN",
      component: "APPLICATION",
      runtime: options.runtime,
      kind: "OPERATION",
      operation: options.operation,
      outcome: failure.outcome,
      durationMs: Math.max(0, options.timer.nowMs() - startedAt),
      trace: mergeTrace(options.initialTrace, failure.trace),
      errorCode: failure.errorCode,
    };

    try {
      options.telemetry.emit(event);
    } catch {
      // Preserve the original product error even when telemetry itself is unhealthy.
    }

    throw error;
  }
}
