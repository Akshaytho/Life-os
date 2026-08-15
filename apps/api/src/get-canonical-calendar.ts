import type { CanonicalCalendarWindow } from "../../../packages/contracts/canonical-calendar";
import type { CanonicalCalendarReader } from "../../../packages/domain/canonical-calendar-read";
import type { AuthenticatedUserPrincipal } from "../../../packages/domain/write-boundary";

const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_WINDOW_ITEMS = 200;
const zonedTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export class CanonicalCalendarReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalCalendarReadError";
  }
}

export interface CanonicalCalendarReadContext {
  principal: AuthenticatedUserPrincipal;
}

export interface CanonicalCalendarReadDependencies {
  reader: CanonicalCalendarReader;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new CanonicalCalendarReadError(`${label} is required`);
  return normalized;
}

function normalizeTimestamp(value: string, label: string): string {
  const normalized = requiredText(value, label);
  if (!zonedTimestampPattern.test(normalized)) {
    throw new CanonicalCalendarReadError(`${label} must include an explicit UTC offset or Z`);
  }
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) throw new CanonicalCalendarReadError(`${label} is invalid`);
  return new Date(milliseconds).toISOString();
}

export async function getCanonicalCalendar(
  input: { from: string; to: string },
  context: CanonicalCalendarReadContext,
  dependencies: CanonicalCalendarReadDependencies,
): Promise<CanonicalCalendarWindow> {
  const userId = requiredText(context.principal.userId, "principal.userId");

  const from = normalizeTimestamp(input.from, "from");
  const to = normalizeTimestamp(input.to, "to");
  const duration = Date.parse(to) - Date.parse(from);
  if (duration <= 0 || duration > MAX_WINDOW_MS) {
    throw new CanonicalCalendarReadError("Calendar read window must be positive and no longer than 31 days");
  }

  const records = await dependencies.reader.listOverlapping(userId, from, to);
  if (records.length > MAX_WINDOW_ITEMS) {
    throw new CanonicalCalendarReadError("Calendar read window is too dense; narrow the requested window");
  }

  return {
    from,
    to,
    items: records.map((record) => ({
      id: record.id,
      title: record.title,
      startsAt: record.startsAt,
      endsAt: record.endsAt,
      category: record.category,
      commitment: record.commitment,
      authorityClass: "FACT",
      committedAt: record.createdAt,
    })),
  };
}
