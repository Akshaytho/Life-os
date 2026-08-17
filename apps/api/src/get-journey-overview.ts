import type { JourneyDecisionOverview } from "../../../packages/contracts/journey";
import type {
  JourneyDecisionReader,
  JourneyDecisionReadRecord,
} from "../../../packages/domain/journey-read";
import type { AuthenticatedUserPrincipal } from "../../../packages/domain/write-boundary";

const MAX_HISTORY_ITEMS = 100;
const READ_LIMIT = MAX_HISTORY_ITEMS + 2;

export type JourneyOverviewReadErrorCode =
  | "INVALID_PRINCIPAL"
  | "JOURNEY_STATE_INVALID"
  | "HISTORY_LIMIT_EXCEEDED";

export class JourneyOverviewReadError extends Error {
  constructor(readonly code: JourneyOverviewReadErrorCode) {
    super(code);
    this.name = "JourneyOverviewReadError";
  }
}

export interface JourneyOverviewReadContext {
  principal: AuthenticatedUserPrincipal;
}

export interface JourneyOverviewReadDependencies {
  reader: JourneyDecisionReader;
}

function requiredUserId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new JourneyOverviewReadError("INVALID_PRINCIPAL");
  return normalized;
}

function validInstant(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateRecord(record: JourneyDecisionReadRecord, userId: string): void {
  if (
    record.userId !== userId ||
    typeof record.journeyId !== "string" ||
    !record.journeyId.trim() ||
    typeof record.name !== "string" ||
    !record.name.trim() ||
    typeof record.activeCapability !== "string" ||
    !record.activeCapability.trim() ||
    !validInstant(record.decidedAt)
  ) {
    throw new JourneyOverviewReadError("JOURNEY_STATE_INVALID");
  }

  if (record.status === "ACTIVE") {
    if (record.endedAt !== null) {
      throw new JourneyOverviewReadError("JOURNEY_STATE_INVALID");
    }
    return;
  }

  if (
    (record.status === "SUPERSEDED" || record.status === "REVOKED") &&
    typeof record.endedAt === "string" &&
    validInstant(record.endedAt)
  ) {
    return;
  }

  throw new JourneyOverviewReadError("JOURNEY_STATE_INVALID");
}

export async function getJourneyOverview(
  context: JourneyOverviewReadContext,
  dependencies: JourneyOverviewReadDependencies,
): Promise<JourneyDecisionOverview> {
  const userId = requiredUserId(context.principal.userId);
  const records = await dependencies.reader.listForUser(userId, READ_LIMIT);

  for (const record of records) validateRecord(record, userId);

  const active = records.filter((record) => record.status === "ACTIVE");
  if (active.length > 1) {
    throw new JourneyOverviewReadError("JOURNEY_STATE_INVALID");
  }

  const history = records.filter(
    (record): record is JourneyDecisionReadRecord & {
      status: "SUPERSEDED" | "REVOKED";
      endedAt: string;
    } => record.status !== "ACTIVE" && record.endedAt !== null,
  );

  if (history.length > MAX_HISTORY_ITEMS) {
    throw new JourneyOverviewReadError("HISTORY_LIMIT_EXCEEDED");
  }

  const current = active[0] ?? null;

  return {
    current: current
      ? {
          id: current.journeyId,
          name: current.name,
          activeCapability: current.activeCapability,
          status: "ACTIVE",
          authorityClass: "DECISION",
          decidedAt: current.decidedAt,
        }
      : null,
    history: history.map((record) => ({
      id: record.journeyId,
      name: record.name,
      activeCapability: record.activeCapability,
      status: record.status,
      authorityClass: "DECISION",
      decidedAt: record.decidedAt,
      endedAt: record.endedAt,
    })),
  };
}
