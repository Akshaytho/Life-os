export type JourneyDecisionStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED";

export interface CurrentJourneyDecision {
  id: string;
  name: string;
  activeCapability: string;
  status: "ACTIVE";
  authorityClass: "DECISION";
  decidedAt: string;
}

export interface HistoricalJourneyDecision {
  id: string;
  name: string;
  activeCapability: string;
  status: "SUPERSEDED" | "REVOKED";
  authorityClass: "DECISION";
  decidedAt: string;
  endedAt: string;
}

export interface JourneyDecisionOverview {
  current: CurrentJourneyDecision | null;
  history: HistoricalJourneyDecision[];
}

export interface ActivateJourneyCommand {
  name: string;
  activeCapability: string;
  expectedCurrentJourneyId: string | null;
  approval: {
    explicit: boolean;
    acknowledgement: "ACTIVATE_JOURNEY";
  };
}

export interface JourneyDecisionReceipt {
  journeyId: string;
  status: JourneyDecisionStatus;
  authorityClass: "DECISION";
  decidedAt: string;
  supersededJourneyId?: string;
  idempotentReplay: boolean;
}
