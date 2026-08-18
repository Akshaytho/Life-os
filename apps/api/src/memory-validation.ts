import {
  memoryKinds,
  type MemoryKind,
  type MemoryRelationship,
  type MemorySourceDomain,
} from "../../../packages/contracts/memory";

export type MemoryErrorCode =
  | "INVALID_PRINCIPAL"
  | "INVALID_REQUEST"
  | "INVALID_TIME_ZONE"
  | "IDEMPOTENCY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "CANDIDATE_NOT_FOUND"
  | "CANDIDATE_ALREADY_RETAINED"
  | "RELATED_MEMORY_NOT_FOUND"
  | "CURRENT_MEMORY_CHANGED"
  | "MEMORY_UNCHANGED"
  | "MEMORY_STATE_INVALID";

export class MemoryError extends Error {
  constructor(readonly code: MemoryErrorCode) {
    super(code);
    this.name = "MemoryError";
  }
}

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function memoryOpaqueId(value: string, code: MemoryErrorCode = "INVALID_REQUEST") {
  const normalized = value.trim();
  if (!opaqueIdPattern.test(normalized)) throw new MemoryError(code);
  return normalized;
}

export function memoryRequestId(value: string, operation: "retain" | "revise") {
  const normalized = memoryOpaqueId(value, "IDEMPOTENCY_REQUIRED");
  const prefix = `web-idem-v1:memory_${operation}:`;
  if (!normalized.startsWith(prefix) || !/^[0-9a-f]{64}$/.test(normalized.slice(prefix.length))) {
    throw new MemoryError("IDEMPOTENCY_REQUIRED");
  }
  return normalized;
}

export function memoryKind(value: MemoryKind): MemoryKind {
  if (!memoryKinds.includes(value)) throw new MemoryError("INVALID_REQUEST");
  return value;
}

export function memorySourceDomain(value: MemorySourceDomain): MemorySourceDomain {
  if (value !== "PERIODIC_REVIEW" && value !== "JOURNEY_PRACTICE") {
    throw new MemoryError("INVALID_REQUEST");
  }
  return value;
}

export function memoryRelationship(value: MemoryRelationship): MemoryRelationship {
  if (value !== "NEW" && value !== "REINFORCES" && value !== "MODIFIES" && value !== "CONTRADICTS") {
    throw new MemoryError("INVALID_REQUEST");
  }
  return value;
}

export function memoryTitle(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new MemoryError("INVALID_REQUEST");
  return normalized;
}

export function memoryBody(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 4000) throw new MemoryError("INVALID_REQUEST");
  return normalized;
}

export function memoryQuery(value: string | undefined) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || /[%_\\]/.test(normalized)) {
    throw new MemoryError("INVALID_REQUEST");
  }
  return normalized;
}

export function memoryTimeZone(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 100) throw new MemoryError("INVALID_TIME_ZONE");
  try { new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date(0)) }
  catch { throw new MemoryError("INVALID_TIME_ZONE") }
  return normalized;
}

export function memoryInstant(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new MemoryError("INVALID_REQUEST");
  return new Date(milliseconds).toISOString();
}
