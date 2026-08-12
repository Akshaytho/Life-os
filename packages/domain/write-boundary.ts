import type {
  ApprovalMode,
  CertaintySignal,
  ProposalState,
  ProposedOperation,
  RoutingDestination,
  RoutingIntent,
  RoutingObservation,
  RoutingTrustClass,
} from "../contracts/input-routing";

export type WriteActorType = "USER" | "LIFE_OS" | "LIFE_OS_AI" | "CHATGPT" | "SYSTEM" | "EXTERNAL_INTEGRATION";
export type WriteSource = "WEB_APP" | "MCP" | "SCHEDULED_JOB" | "AI_CHAT" | "IMPORT";

export type CalendarCategory = "Work" | "Creator" | "Learning" | "Health" | "Family" | "Friends" | "Travel" | "Personal" | "Rest";
export type CalendarCommitment = "Fixed" | "Important" | "Flexible" | "Optional";
export type ProposalApprovalMode = ApprovalMode;
export type StoredProposalState = ProposalState;

export interface AuthenticatedUserPrincipal { actorType: "USER"; userId: string; }
export interface WriteRequestContext { principal: AuthenticatedUserPrincipal; source: "WEB_APP"; receivedAt: string; requestId: string; }

export interface CaptureRecord {
  captureId: string; userId: string; rawText: string; source: WriteSource; correlationId: string;
  requestId: string; receivedAt: string; recordedAt: string;
}

export interface RoutingInterpretationRecord {
  interpretationId: string; captureId: string; userId: string; version: 1;
  interpreter: "LOCAL_SAMPLE" | "LIFE_OS_AI"; intent: RoutingIntent; certainty: CertaintySignal;
  confidence: number; observations: RoutingObservation[]; clarification?: string; createdAt: string;
}

export interface RoutingProposalRecord {
  proposalId: string; interpreterProposalKey: string; userId: string; captureId: string; interpretationId?: string;
  destination: RoutingDestination; operation: ProposedOperation; summary: string; targetTrustClass: RoutingTrustClass;
  approvalMode: ApprovalMode; state: ProposalState; reason: string; payloadJson: Record<string, unknown>;
  createdAt: string; appliedAt?: string; appliedEntityId?: string; appliedEventId?: string;
}

export interface RoutingPersistenceBundle { interpretation: RoutingInterpretationRecord; proposals: RoutingProposalRecord[]; }

export interface CalendarPlanInput {
  title: string; startsAt: string; endsAt: string; category: CalendarCategory | "UNRESOLVED"; commitment: CalendarCommitment;
}

export interface ApplyStoredProposalCommand { proposalId: string; confirmation: { explicit: boolean }; }

export interface StoredCalendarProposal {
  proposalId: string; userId: string; captureId: string; sourceText: string; correlationId: string;
  destination: "CALENDAR"; operation: "CREATE_CALENDAR_PLAN"; approvalMode: ProposalApprovalMode; state: StoredProposalState;
  plan: CalendarPlanInput; createdAt: string; appliedAt?: string; appliedEntityId?: string; appliedEventId?: string;
}

export interface CalendarPlanRecord {
  id: string; userId: string; title: string; startsAt: string; endsAt: string; category: CalendarCategory;
  commitment: CalendarCommitment; createdAt: string; sourceProposalId: string;
}

export interface DomainEventRecord {
  eventId: string; userId: string; occurredAt: string; recordedAt: string; actorType: WriteActorType; actorId?: string;
  eventType: "CALENDAR_EVENT_CREATED"; entityType: "calendar_event"; entityId: string; source: WriteSource;
  correlationId: string; causationEventId?: string; payloadJson: Record<string, unknown>; schemaVersion: 1;
}

export interface AppliedProposalRecord {
  proposalId: string; appliedAt: string; confirmedByActorId: string; requestFingerprint: string;
  entityType: "calendar_event"; entityId: string; eventId: string;
}

export interface CommitReceipt {
  proposalId: string; entityType: "calendar_event"; entityId: string; eventId: string; appliedAt: string; idempotentReplay: boolean;
}

export interface WriteTransaction {
  getOrCreateCaptureRecord(record: CaptureRecord): Promise<CaptureRecord>;
  lockCaptureForRouting(captureId: string, userId: string): Promise<boolean>;
  getRoutingBundleForCapture(captureId: string, userId: string): Promise<RoutingPersistenceBundle | undefined>;
  createRoutingInterpretation(record: RoutingInterpretationRecord): Promise<void>;
  createRoutingProposal(record: RoutingProposalRecord): Promise<void>;
  getStoredCalendarProposalForUpdate(proposalId: string, userId: string): Promise<StoredCalendarProposal | undefined>;
  findAppliedProposal(proposalId: string): Promise<AppliedProposalRecord | undefined>;
  createCalendarPlan(record: CalendarPlanRecord): Promise<void>;
  appendDomainEvent(event: DomainEventRecord): Promise<void>;
  markProposalApplied(record: AppliedProposalRecord): Promise<void>;
  markStoredProposalApplied(proposalId: string, userId: string, appliedAt: string, entityId: string, eventId: string): Promise<void>;
}

/**
 * Private Life OS transactions always run inside a trusted authenticated-user scope.
 *
 * PostgreSQL implementations bind this user ID to transaction-local RLS context before
 * exposing a WriteTransaction. In-memory implementations enforce the same ownership shape
 * so unit tests cannot accidentally rely on behavior production RLS would reject.
 */
export interface WriteUnitOfWork {
  run<T>(authenticatedUserId: string, work: (transaction: WriteTransaction) => Promise<T>): Promise<T>;
}
export interface IdGenerator { next(prefix: "calendar" | "event"): string; }
export interface RoutingIdGenerator { next(prefix: "capture" | "interpretation" | "proposal"): string; }
export interface Clock { now(): string; }
