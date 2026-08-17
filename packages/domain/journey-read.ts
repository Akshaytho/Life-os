import type { JourneyDecisionStatus } from "../contracts/journey";

export interface JourneyDecisionReadRecord {
  journeyId: string;
  userId: string;
  name: string;
  activeCapability: string;
  status: JourneyDecisionStatus;
  decidedAt: string;
  endedAt: string | null;
}

export interface JourneyDecisionReader {
  listForUser(authenticatedUserId: string, limit: number): Promise<JourneyDecisionReadRecord[]>;
}
