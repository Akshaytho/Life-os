import type { PeriodicReviewIdentity, PeriodicReviewKind } from "../../../packages/contracts/periodic-reviews";

export type PeriodicReviewsErrorCode =
  | "INVALID_PRINCIPAL"
  | "INVALID_PERIOD"
  | "INVALID_TIME_ZONE"
  | "INVALID_REVIEW"
  | "IDEMPOTENCY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "CURRENT_REVIEW_CHANGED"
  | "REVIEW_UNCHANGED"
  | "PERIODIC_REVIEW_STATE_INVALID"
  | "PERIODIC_REVIEW_LIMIT_EXCEEDED";

export class PeriodicReviewsError extends Error {
  constructor(readonly code: PeriodicReviewsErrorCode) {
    super(code);
    this.name = "PeriodicReviewsError";
  }
}

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function periodicOpaqueId(value: string, code: PeriodicReviewsErrorCode): string {
  const normalized = value.trim();
  if (!opaqueIdPattern.test(normalized)) throw new PeriodicReviewsError(code);
  return normalized;
}

export function periodicRequestId(value: string): string {
  const normalized = periodicOpaqueId(value, "IDEMPOTENCY_REQUIRED");
  const prefix = "web-idem-v1:periodic_review_submit:";
  if (!normalized.startsWith(prefix) || !/^[0-9a-f]{64}$/.test(normalized.slice(prefix.length))) {
    throw new PeriodicReviewsError("IDEMPOTENCY_REQUIRED");
  }
  return normalized;
}

export function periodicLocalDate(value: string): string {
  const normalized = value.trim();
  if (!datePattern.test(normalized)) throw new PeriodicReviewsError("INVALID_PERIOD");
  const [year, month, day] = normalized.split("-").map(Number);
  const instant = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    instant.getUTCFullYear() !== year
    || instant.getUTCMonth() + 1 !== month
    || instant.getUTCDate() !== day
  ) throw new PeriodicReviewsError("INVALID_PERIOD");
  return normalized;
}

function dateOf(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

export function datePlus(value: string, days: number): string {
  const instant = dateOf(periodicLocalDate(value));
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

export function periodicTimeZone(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 100) throw new PeriodicReviewsError("INVALID_TIME_ZONE");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date(0));
  } catch {
    throw new PeriodicReviewsError("INVALID_TIME_ZONE");
  }
  return normalized;
}

export function periodicKind(value: PeriodicReviewKind): PeriodicReviewKind {
  if (value !== "WEEK" && value !== "MONTH") throw new PeriodicReviewsError("INVALID_PERIOD");
  return value;
}

export function periodicIdentity(value: PeriodicReviewIdentity): PeriodicReviewIdentity {
  const kind = periodicKind(value.kind);
  const periodStart = periodicLocalDate(value.periodStart);
  const periodEnd = periodicLocalDate(value.periodEnd);
  const timeZone = periodicTimeZone(value.timeZone);
  const start = dateOf(periodStart);
  const end = dateOf(periodEnd);
  if (kind === "WEEK") {
    if (start.getUTCDay() !== 1 || datePlus(periodStart, 6) !== periodEnd) {
      throw new PeriodicReviewsError("INVALID_PERIOD");
    }
  } else {
    const expectedStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const expectedEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    if (
      expectedStart.toISOString().slice(0, 10) !== periodStart
      || expectedEnd.toISOString().slice(0, 10) !== periodEnd
    ) throw new PeriodicReviewsError("INVALID_PERIOD");
  }
  if (end.getTime() < start.getTime()) throw new PeriodicReviewsError("INVALID_PERIOD");
  return { kind, periodStart, periodEnd, timeZone };
}

export function adjacentPeriodStarts(identity: PeriodicReviewIdentity) {
  if (identity.kind === "WEEK") {
    return {
      previousPeriodStart: datePlus(identity.periodStart, -7),
      nextPeriodStart: datePlus(identity.periodStart, 7),
    };
  }
  const start = dateOf(identity.periodStart);
  const previous = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return {
    previousPeriodStart: previous.toISOString().slice(0, 10),
    nextPeriodStart: next.toISOString().slice(0, 10),
  };
}

export function periodicReflection(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 4000) throw new PeriodicReviewsError("INVALID_REVIEW");
  return normalized;
}

export function optionalPeriodicReflection(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return periodicReflection(value);
}

export function periodicInstant(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new PeriodicReviewsError("INVALID_REVIEW");
  return new Date(milliseconds).toISOString();
}

export function periodicCalendarInstant(value: string): string {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value.trim())) {
    throw new PeriodicReviewsError("INVALID_PERIOD");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new PeriodicReviewsError("INVALID_PERIOD");
  return new Date(milliseconds).toISOString();
}

function localParts(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function periodicCalendarWindow(
  identity: PeriodicReviewIdentity,
  calendarFrom: string,
  calendarTo: string,
) {
  const from = periodicCalendarInstant(calendarFrom);
  const to = periodicCalendarInstant(calendarTo);
  if (Date.parse(to) <= Date.parse(from)) throw new PeriodicReviewsError("INVALID_PERIOD");
  const fromParts = localParts(from, identity.timeZone);
  const toParts = localParts(to, identity.timeZone);
  if (
    fromParts.date !== identity.periodStart
    || toParts.date !== datePlus(identity.periodEnd, 1)
    || fromParts.hour !== "00"
    || fromParts.minute !== "00"
    || fromParts.second !== "00"
    || toParts.hour !== "00"
    || toParts.minute !== "00"
    || toParts.second !== "00"
  ) throw new PeriodicReviewsError("INVALID_PERIOD");
  return { from, to };
}
