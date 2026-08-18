import {
  driftExplanations,
  driftReturnPostures,
  type DriftExplanation,
  type DriftReturnPosture,
} from "../../../packages/contracts/drift-return";

export type DriftErrorCode =
  | "INVALID_PRINCIPAL"
  | "INVALID_DRIFT"
  | "INVALID_DECISION"
  | "INVALID_EXPLANATION"
  | "INVALID_RETURN_POSTURE"
  | "INVALID_SOURCE_NOTE"
  | "INVALID_REFLECTION_NOTE"
  | "IDEMPOTENCY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "DRIFT_NOT_FOUND"
  | "DRIFT_DECISION_CHANGED"
  | "DRIFT_DECISION_UNCHANGED"
  | "DRIFT_UNDERSTANDING_REQUIRED"
  | "DRIFT_ALREADY_RESOLVED";

export class DriftError extends Error {
  constructor(readonly code: DriftErrorCode) {
    super(code);
    this.name = "DriftError";
  }
}

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const validExplanations = new Set<DriftExplanation>(driftExplanations);
const validReturnPostures = new Set<DriftReturnPosture>(driftReturnPostures);

export function requiredDriftOpaqueId(value: string, code: DriftErrorCode): string {
  const normalized = value.trim();
  if (!opaqueIdPattern.test(normalized)) throw new DriftError(code);
  return normalized;
}

export function requiredDriftRequestId(
  value: string,
  scope: "drift_record" | "drift_understand" | "drift_return",
): string {
  const normalized = requiredDriftOpaqueId(value, "IDEMPOTENCY_REQUIRED");
  const prefix = `web-idem-v1:${scope}:`;
  if (!normalized.startsWith(prefix) || !/^[0-9a-f]{64}$/.test(normalized.slice(prefix.length))) {
    throw new DriftError("IDEMPOTENCY_REQUIRED");
  }
  return normalized;
}

function normalizedOptionalNote(
  value: string | undefined,
  maximum: number,
  code: "INVALID_SOURCE_NOTE" | "INVALID_REFLECTION_NOTE",
): string | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  if (value.length > maximum) throw new DriftError(code);
  return value;
}

export function normalizedDriftSourceNote(value: string | undefined): string | undefined {
  return normalizedOptionalNote(value, 4000, "INVALID_SOURCE_NOTE");
}

export function normalizedDriftReflectionNote(value: string | undefined): string | undefined {
  return normalizedOptionalNote(value, 2000, "INVALID_REFLECTION_NOTE");
}

export function normalizedDriftExplanation(value: DriftExplanation): DriftExplanation {
  if (!validExplanations.has(value)) throw new DriftError("INVALID_EXPLANATION");
  return value;
}

export function normalizedDriftReturnPosture(value: DriftReturnPosture): DriftReturnPosture {
  if (!validReturnPostures.has(value)) throw new DriftError("INVALID_RETURN_POSTURE");
  return value;
}

export function normalizedDriftInstant(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new DriftError("INVALID_DECISION");
  return new Date(milliseconds).toISOString();
}

export function normalizedDriftExpectedRevision(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) {
    throw new DriftError("INVALID_DECISION");
  }
  return value;
}
