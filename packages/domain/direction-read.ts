import type { DirectionDecisionStatus } from "../contracts/direction";

export interface DirectionDecisionReadRecord {
  directionId: string;
  userId: string;
  statement: string;
  status: DirectionDecisionStatus;
  decidedAt: string;
  endedAt: string | null;
}

export interface DirectionDecisionReader {
  listForUser(
    authenticatedUserId: string,
    limit: number,
  ): Promise<DirectionDecisionReadRecord[]>;
}
