import type {
  ApprovalMode,
  CertaintySignal,
  ProposalState,
  ProposedOperation,
  RoutingDestination,
  RoutingIntent,
  RoutingTrustClass,
} from "./input-routing";

export type InteractionTraceStatus =
  | "AWAITING_INTERPRETATION"
  | "AWAITING_REVIEW"
  | "NEEDS_USER"
  | "READY_FOR_APPROVAL"
  | "PARTIALLY_COMMITTED"
  | "COMMITTED"
  | "CLOSED_NO_CHANGE";

export type InteractionActorType =
  | "USER"
  | "LIFE_OS"
  | "LIFE_OS_AI"
  | "CHATGPT"
  | "SYSTEM"
  | "EXTERNAL_INTEGRATION";

export interface InteractionSourceStep {
  authorityClass: "USER_SOURCE";
  actorType: "USER";
  text: string;
  occurredAt: string;
  recordedAt: string;
  source: string;
}

export interface InteractionObservationStep {
  authorityClass: "OBSERVATION";
  actorType: "LIFE_OS_AI" | "LIFE_OS";
  interpreter: "LOCAL_SAMPLE" | "LIFE_OS_AI";
  intent: RoutingIntent;
  certainty: CertaintySignal;
  confidence: number;
  observations: Array<{ id: string; label: string; value: string; trustClass: "OBSERVATION" }>;
  clarification?: string;
  createdAt: string;
}

export interface InteractionUserActionStep {
  authorityClass: "DECISION";
  action: "APPROVED" | "REJECTED";
  actorType: "USER";
  actorId: string;
  at: string;
  recordedAt: string;
  reason?: string;
}

export interface InteractionCanonicalChange {
  resultClass: RoutingTrustClass;
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorType: InteractionActorType;
  actorId?: string;
  source: string;
  occurredAt: string;
  recordedAt: string;
  summary: string;
  details?: Record<string, string>;
}

export interface InteractionProposalTrace {
  proposalId: string;
  authorityClass: "SUGGESTION";
  proposedResultClass: RoutingTrustClass;
  destination: RoutingDestination;
  operation: ProposedOperation;
  approvalMode: ApprovalMode;
  state: ProposalState;
  summary: string;
  reason: string;
  createdAt: string;
  userAction?: InteractionUserActionStep;
  canonicalChange?: InteractionCanonicalChange;
}

export interface InteractionProjectionEffects {
  status: "NOT_RECORDED_YET" | "RECORDED";
  items: Array<{
    screen: "TODAY" | "JOURNEY" | "CALENDAR" | "MEMORY" | "YOU";
    summary: string;
    causedByEventId: string;
  }>;
}

/**
 * Stable, human-facing trace contract. It intentionally excludes request latency,
 * stack traces, database retries, credentials, request fingerprints and other
 * developer telemetry.
 */
export interface InteractionChangeTrace {
  captureId: string;
  correlationId: string;
  status: InteractionTraceStatus;
  source: InteractionSourceStep;
  interpretation?: InteractionObservationStep;
  proposals: InteractionProposalTrace[];
  projectionEffects: InteractionProjectionEffects;
}
