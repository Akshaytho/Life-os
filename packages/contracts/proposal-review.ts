import type {
  ApprovalMode,
  CertaintySignal,
  ProposalState,
  ProposedOperation,
  RoutingDestination,
  RoutingIntent,
  RoutingInterpreter,
  RoutingObservation,
  RoutingTrustClass,
} from "./input-routing";

export type ProposalReviewState = "AWAITING_INTERPRETATION" | "READY_FOR_REVIEW";

export interface ProposalReviewSource {
  captureId: string;
  rawText: string;
  authorityClass: "USER_SOURCE";
  sourceActor: "USER";
  source: "WEB_APP" | "MCP" | "SCHEDULED_JOB" | "AI_CHAT" | "IMPORT";
  correlationId: string;
  receivedAt: string;
  recordedAt: string;
}

export interface ProposalReviewInterpretation {
  interpretationId: string;
  authorityClass: "OBSERVATION";
  interpreter: RoutingInterpreter;
  intent: RoutingIntent;
  certainty: CertaintySignal;
  confidence: number;
  observations: RoutingObservation[];
  clarification?: string;
  createdAt: string;
}

export interface ProposalReviewDetail {
  key: string;
  label: string;
  value: string;
}

export interface ProposalReviewItem {
  proposalId: string;
  authorityClass: "SUGGESTION";
  destination: RoutingDestination;
  operation: ProposedOperation;
  summary: string;
  proposedResultClass: RoutingTrustClass;
  approvalMode: ApprovalMode;
  state: ProposalState;
  reason: string;
  details: ProposalReviewDetail[];
  createdAt: string;
  appliedAt?: string;
  appliedEntityId?: string;
  appliedEventId?: string;
}

export interface CaptureProposalReview {
  reviewState: ProposalReviewState;
  source: ProposalReviewSource;
  interpretation?: ProposalReviewInterpretation;
  proposals: ProposalReviewItem[];
}
