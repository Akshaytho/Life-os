export type RoutingDestination =
  | "TODAY"
  | "CALENDAR"
  | "JOURNEY"
  | "MEMORY"
  | "YOU"
  | "BRAIN_DUMP"
  | "DRIFT"
  | "NOT_NOW";

export type RoutingIntent =
  | "DATED_PLAN"
  | "LEARNING"
  | "DIRECTION_RECONSIDERATION"
  | "HEALTH_OBSERVATION"
  | "DRIFT_SIGNAL"
  | "RAW_THOUGHT"
  | "UNKNOWN";

export type CertaintySignal = "TENTATIVE" | "LIKELY" | "CONFIRMED" | "UNSPECIFIED";

export type RoutingTrustClass = "FACT" | "REFLECTION" | "OBSERVATION" | "SUGGESTION" | "DECISION";

export type ProposalState =
  | "PROPOSED"
  | "NEEDS_CONFIRMATION"
  | "READY_TO_APPLY"
  | "REJECTED"
  | "APPLIED";

export type ApprovalMode =
  | "REVIEW_AND_APPLY"
  | "EXPLICIT_CONFIRMATION"
  | "HIGH_AUTHORITY_APPROVAL";

export type ProposedOperation =
  | "CREATE_CALENDAR_PLAN"
  | "RECORD_LEARNING_EVIDENCE"
  | "RECORD_MEMORY"
  | "RECORD_REFLECTION"
  | "RECORD_DECISION"
  | "START_DRIFT_FLOW"
  | "PARK_NOT_NOW"
  | "PROPOSE_DIRECTION_RECONSIDERATION"
  | "KEEP_RAW_CAPTURE";

export interface RoutingObservation {
  id: string;
  label: string;
  value: string;
  trustClass: "OBSERVATION";
}

export interface RoutingPreviewField {
  label: string;
  value: string;
}

export interface RoutingProposal {
  id: string;
  destination: RoutingDestination;
  operation: ProposedOperation;
  summary: string;
  targetTrustClass: RoutingTrustClass;
  approvalMode: ApprovalMode;
  state: ProposalState;
  reason: string;
  preview?: RoutingPreviewField[];
}

export interface RoutingInterpretation {
  input: string;
  intent: RoutingIntent;
  certainty: CertaintySignal;
  confidence: number;
  observations: RoutingObservation[];
  proposals: RoutingProposal[];
  clarification?: string;
  interpreter: "LOCAL_SAMPLE" | "LIFE_OS_AI";
  sourceActor: "USER";
}
