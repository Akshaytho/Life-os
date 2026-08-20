import type { DailyReturnState } from "../../../packages/contracts/daily-return";

export type DailyReturnErrorCode =
  | "INVALID_PRINCIPAL"
  | "INVALID_ENTRY"
  | "INVALID_REVIEW"
  | "INVALID_DATE"
  | "INVALID_TIME_ZONE"
  | "INVALID_RETURN_STATE"
  | "IDEMPOTENCY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "CURRENT_REVIEW_CHANGED"
  | "REVIEW_UNCHANGED";

export class DailyReturnError extends Error {
  constructor(readonly code: DailyReturnErrorCode) {
    super(code);
    this.name = "DailyReturnError";
  }
}

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const maxReflectionLength = 4000;
const validReturnStates = new Set<DailyReturnState>([
  "RETURNED",
  "STILL_RETURNING",
  "NO_DRIFT_NOTICED",
]);

export function requiredOpaqueId(value: string, code: DailyReturnErrorCode): string {
  const normalized = value.trim();
  if (!opaqueIdPattern.test(normalized)) throw new DailyReturnError(code);
  return normalized;
}

export function requiredDailyReturnRequestId(
  value: string,
  scope: "daily_log_append" | "daily_return_submit",
): string {
  const normalized = requiredOpaqueId(value, "IDEMPOTENCY_REQUIRED");
  const prefix = `web-idem-v1:${scope}:`;
  if (!normalized.startsWith(prefix) || !/^[0-9a-f]{64}$/.test(normalized.slice(prefix.length))) {
    throw new DailyReturnError("IDEMPOTENCY_REQUIRED");
  }
  return normalized;
}

export function normalizedLocalDate(value: string): string {
  const normalized = value.trim();
  if (!localDatePattern.test(normalized)) throw new DailyReturnError("INVALID_DATE");
  const [year, month, day] = normalized.split("-").map(Number);
  const instant = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    instant.getUTCFullYear() !== year
    || instant.getUTCMonth() + 1 !== month
    || instant.getUTCDate() !== day
  ) {
    throw new DailyReturnError("INVALID_DATE");
  }
  return normalized;
}

export function normalizedTimeZone(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 100) throw new DailyReturnError("INVALID_TIME_ZONE");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date(0));
  } catch {
    throw new DailyReturnError("INVALID_TIME_ZONE");
  }
  return normalized;
}

export function normalizedReflection(
  value: string,
  code: "INVALID_ENTRY" | "INVALID_REVIEW",
): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxReflectionLength) {
    throw new DailyReturnError(code);
  }
  return normalized;
}

export function normalizedReturnState(value: DailyReturnState): DailyReturnState {
  if (!validReturnStates.has(value)) throw new DailyReturnError("INVALID_RETURN_STATE");
  return value;
}

export function normalizedInstant(
  value: string,
  code: "INVALID_ENTRY" | "INVALID_REVIEW",
): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new DailyReturnError(code);
  return new Date(milliseconds).toISOString();
}
