import type { DirectionDecisionOverview } from "../../../packages/contracts/direction";
import type {
  DirectionDecisionReader,
  DirectionDecisionReadRecord,
} from "../../../packages/domain/direction-read";
import type { AuthenticatedUserPrincipal } from "../../../packages/domain/write-boundary";

const MAX_HISTORY_ITEMS = 100;
const READ_LIMIT = MAX_HISTORY_ITEMS + 2;

export type DirectionOverviewReadErrorCode =
  | "INVALID_PRINCIPAL"
  | "DIRECTION_STATE_INVALID"
  | "HISTORY_LIMIT_EXCEEDED";

export class DirectionOverviewReadError extends Error {
  constructor(readonly code: DirectionOverviewReadErrorCode) {
    super(code);
    this.name = "DirectionOverviewReadError";
  }
}

export interface DirectionOverviewReadContext {
  principal: AuthenticatedUserPrincipal;
}

export interface DirectionOverviewReadDependencies {
  reader: DirectionDecisionReader;
}

function requiredUserId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new DirectionOverviewReadError("INVALID_PRINCIPAL");
  return normalized;
}

function validInstant(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateRecord(record: DirectionDecisionReadRecord, userId: string): void {
  if (
    record.userId !== userId ||
    typeof record.directionId !== "string" ||
    !record.directionId.trim() ||
    typeof record.statement !== "string" ||
    !record.statement.trim() ||
    !validInstant(record.decidedAt)
  ) {
    throw new DirectionOverviewReadError("DIRECTION_STATE_INVALID");
  }

  if (record.status === "ACTIVE") {
    if (record.endedAt !== null) {
      throw new DirectionOverviewReadError("DIRECTION_STATE_INVALID");
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

  throw new DirectionOverviewReadError("DIRECTION_STATE_INVALID");
}

export async function getDirectionOverview(
  context: DirectionOverviewReadContext,
  dependencies: DirectionOverviewReadDependencies,
): Promise<DirectionDecisionOverview> {
  const userId = requiredUserId(context.principal.userId);
  const records = await dependencies.reader.listForUser(userId, READ_LIMIT);

  for (const record of records) validateRecord(record, userId);

  const active = records.filter((record) => record.status === "ACTIVE");
  if (active.length > 1) {
    throw new DirectionOverviewReadError("DIRECTION_STATE_INVALID");
  }

  const history = records.filter(
    (record): record is DirectionDecisionReadRecord & {
      status: "SUPERSEDED" | "REVOKED";
      endedAt: string;
    } => record.status !== "ACTIVE" && record.endedAt !== null,
  );

  if (history.length > MAX_HISTORY_ITEMS) {
    throw new DirectionOverviewReadError("HISTORY_LIMIT_EXCEEDED");
  }

  const current = active[0] ?? null;

  return {
    current: current
      ? {
          id: current.directionId,
          statement: current.statement,
          status: "ACTIVE",
          authorityClass: "DECISION",
          decidedAt: current.decidedAt,
        }
      : null,
    history: history.map((record) => ({
      id: record.directionId,
      statement: record.statement,
      status: record.status,
      authorityClass: "DECISION",
      decidedAt: record.decidedAt,
      endedAt: record.endedAt,
    })),
  };
}
