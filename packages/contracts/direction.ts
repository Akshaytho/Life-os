export type DirectionDecisionStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED";

export interface CurrentDirectionDecision {
  id: string;
  statement: string;
  status: "ACTIVE";
  authorityClass: "DECISION";
  decidedAt: string;
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
  status: "ACTIVE";
  authorityClass: "DECISION";
  decidedAt: string;
  supersededDirectionId?: string;
  idempotentReplay: boolean;
}
