export type DirectionDecisionStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED";

export interface CurrentDirectionDecision {
  id: string;
  statement: string;
  status: "ACTIVE";
  authorityClass: "DECISION";
  decidedAt: string;
}

export interface HistoricalDirectionDecision {
  id: string;
  statement: string;
  status: "SUPERSEDED" | "REVOKED";
  authorityClass: "DECISION";
  decidedAt: string;
  endedAt: string;
}

export interface DirectionDecisionOverview {
  current: CurrentDirectionDecision | null;
  history: HistoricalDirectionDecision[];
}

export interface SetCurrentDirectionCommand {
  statement: string;
  expectedCurrentDirectionId: string | null;
  approval: {
    explicit: boolean;
    acknowledgement: "SET_AS_CURRENT_DIRECTION";
  };
}

export interface DirectionDecisionReceipt {
  directionId: string;
  status: DirectionDecisionStatus;
  authorityClass: "DECISION";
  decidedAt: string;
  supersededDirectionId?: string;
  idempotentReplay: boolean;
}
