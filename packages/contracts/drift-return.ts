export const driftExplanations = [
  "TEMPORARY_INSPIRATION",
  "COMPARISON",
  "AVOIDANCE",
  "EMOTIONAL_REACTION",
  "GENUINE_RECONSIDERATION",
  "UNSURE",
] as const;

export type DriftExplanation = typeof driftExplanations[number];

export const driftReturnPostures = [
  "STILL_RETURNING",
  "RETURN_TO_DIRECTION",
  "PARK_IDEA",
  "REFLECT_ONLY",
  "ADJUST_PLAN",
  "DELIBERATE_RECONSIDERATION",
] as const;

export type DriftReturnPosture = typeof driftReturnPostures[number];

export const driftLifecycleStates = [
  "RECORDED",
  "UNDERSTOOD",
  "STILL_RETURNING",
  "RESOLVED",
] as const;

export type DriftLifecycleState = typeof driftLifecycleStates[number];
export type DriftDecisionStatus = "CURRENT" | "SUPERSEDED";

export interface DriftDecisionRevision {
  decisionId: string;
  rootDecisionId: string;
  revision: number;
  explanation: DriftExplanation;
  triggerNote?: string;
  emotionNote?: string;
  distractionNote?: string;
  returnPosture?: DriftReturnPosture;
  lifecycleState: Exclude<DriftLifecycleState, "RECORDED">;
  status: DriftDecisionStatus;
  authorityClass: "DECISION";
  decidedAt: string;
  recordedAt: string;
  endedAt?: string;
}

export interface DriftOccurrence {
  driftId: string;
  sourceNote?: string;
  authorityClass: "USER_SOURCE";
  occurredAt: string;
  recordedAt: string;
  lifecycleState: DriftLifecycleState;
  currentDecision: DriftDecisionRevision | null;
  decisionHistory: DriftDecisionRevision[];
}

export interface DriftOverview {
  items: DriftOccurrence[];
}

export interface RecordDriftCommand {
  sourceNote?: string;
}

export interface ConfirmDriftUnderstandingCommand {
  explanation: DriftExplanation;
  triggerNote?: string;
  emotionNote?: string;
  distractionNote?: string;
  expectedCurrentDecisionId: string | null;
}

export interface RecordDriftReturnCommand {
  returnPosture: DriftReturnPosture;
  expectedCurrentRevision: number;
}

export interface DriftOccurrenceReceipt {
  driftId: string;
  lifecycleState: "RECORDED";
  authorityClass: "USER_SOURCE";
  occurredAt: string;
  recordedAt: string;
  idempotentReplay: boolean;
}

export interface DriftDecisionReceipt {
  decisionId: string;
  rootDecisionId: string;
  driftId: string;
  revision: number;
  explanation: DriftExplanation;
  returnPosture?: DriftReturnPosture;
  lifecycleState: Exclude<DriftLifecycleState, "RECORDED">;
  status: "CURRENT";
  authorityClass: "DECISION";
  decidedAt: string;
  recordedAt: string;
  supersededDecisionId?: string;
  idempotentReplay: boolean;
}
