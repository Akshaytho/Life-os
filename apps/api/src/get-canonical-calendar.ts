import type { CanonicalCalendarWindow } from "../../../packages/contracts/canonical-calendar";
import type { CanonicalCalendarReader, CanonicalCalendarRecord } from "../../../packages/domain/canonical-calendar-read";
import type { AuthenticatedUserPrincipal, CalendarCategory, CalendarCommitment } from "../../../packages/domain/write-boundary";

const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_WINDOW_ITEMS = 200;
const zonedTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const calendarCategories = new Set<CalendarCategory>([
  "Work", "Creator", "Learning", "Health", "Family", "Friends", "Travel", "Personal", "Rest",
]);
const calendarCommitments = new Set<CalendarCommitment>(["Fixed", "Important", "Flexible", "Optional"]);

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

function assertCanonicalRecord(
  record: CanonicalCalendarRecord,
  authenticatedUserId: string,
  fromMilliseconds: number,
  toMilliseconds: number,
) {
  requiredText(record.id, "calendar.id");
  requiredText(record.title, "calendar.title");
  requiredText(record.sourceProposalId, "calendar.sourceProposalId");
  if (record.userId !== authenticatedUserId) {
    throw new CanonicalCalendarReadError("Calendar reader returned a record outside authenticated scope");
  }
  if (!calendarCategories.has(record.category)) {
    throw new CanonicalCalendarReadError("Calendar reader returned an unsupported category");
  }
  if (!calendarCommitments.has(record.commitment)) {
    throw new CanonicalCalendarReadError("Calendar reader returned an unsupported commitment");
  }

  const startsAt = normalizeTimestamp(record.startsAt, "calendar.startsAt");
  const endsAt = normalizeTimestamp(record.endsAt, "calendar.endsAt");
  normalizeTimestamp(record.createdAt, "calendar.createdAt");
  const startsMilliseconds = Date.parse(startsAt);
  const endsMilliseconds = Date.parse(endsAt);
  if (endsMilliseconds <= startsMilliseconds) {
    throw new CanonicalCalendarReadError("Calendar reader returned a non-positive event interval");
  }
  if (startsMilliseconds >= toMilliseconds || endsMilliseconds <= fromMilliseconds) {
    throw new CanonicalCalendarReadError("Calendar reader returned a record outside the requested window");
  }
}

function compareCanonicalRecords(left: CanonicalCalendarRecord, right: CanonicalCalendarRecord): number {
  const startDifference = Date.parse(left.startsAt) - Date.parse(right.startsAt);
  if (startDifference !== 0) return startDifference;
  const endDifference = Date.parse(left.endsAt) - Date.parse(right.endsAt);
  if (endDifference !== 0) return endDifference;
  return left.id.localeCompare(right.id);
}

export async function getCanonicalCalendar(
  input: { from: string; to: string },
  context: CanonicalCalendarReadContext,
  dependencies: CanonicalCalendarReadDependencies,
): Promise<CanonicalCalendarWindow> {
  const userId = requiredText(context.principal.userId, "principal.userId");

  const from = normalizeTimestamp(input.from, "from");
  const to = normalizeTimestamp(input.to, "to");
  const fromMilliseconds = Date.parse(from);
  const toMilliseconds = Date.parse(to);
  const duration = toMilliseconds - fromMilliseconds;
  if (duration <= 0 || duration > MAX_WINDOW_MS) {
    throw new CanonicalCalendarReadError("Calendar read window must be positive and no longer than 31 days");
  }

  const records = await dependencies.reader.listOverlapping(userId, from, to);
  if (records.length > MAX_WINDOW_ITEMS) {
    throw new CanonicalCalendarReadError("Calendar read window is too dense; narrow the requested window");
  }

  const ids = new Set<string>();
  for (const record of records) {
    assertCanonicalRecord(record, userId, fromMilliseconds, toMilliseconds);
    if (ids.has(record.id)) {
      throw new CanonicalCalendarReadError("Calendar reader returned duplicate canonical identities");
    }
    ids.add(record.id);
  }

  const orderedRecords = [...records].sort(compareCanonicalRecords);
  return {
    from,
    to,
    items: orderedRecords.map((record) => ({
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
