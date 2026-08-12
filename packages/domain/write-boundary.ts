export type WriteActorType = "USER" | "LIFE_OS" | "LIFE_OS_AI" | "CHATGPT" | "SYSTEM" | "EXTERNAL_INTEGRATION";
export type WriteSource = "WEB_APP" | "MCP" | "SCHEDULED_JOB" | "AI_CHAT" | "IMPORT";

export type CalendarCategory =
  | "Work"
  | "Creator"
  | "Learning"
  | "Health"
  | "Family"
  | "Friends"
  | "Travel"
  | "Personal"
  | "Rest";

export type CalendarCommitment = "Fixed" | "Important" | "Flexible" | "Optional";
export type ProposalApprovalMode = "REVIEW_AND_APPLY" | "EXPLICIT_CONFIRMATION" | "HIGH_AUTHORITY_APPROVAL";
export type StoredProposalState = "PROPOSED" | "NEEDS_CONFIRMATION" | "READY_TO_APPLY" | "REJECTED" | "APPLIED";

export interface AuthenticatedUserPrincipal {
  actorType: "USER";
  userId: string;
}

export interface WriteRequestContext {
  principal: AuthenticatedUserPrincipal;
  source: "WEB_APP";
  receivedAt: string;
  requestId: string;
}

export interface CalendarPlanInput {
  title: string;
  startsAt: string;
  endsAt: string;
  category: CalendarCategory | "UNRESOLVED";
  commitment: CalendarCommitment;
}

export interface ApplyStoredProposalCommand {
  proposalId: string;
  confirmation: { explicit: boolean };
}

export interface StoredCalendarProposal {
  proposalId: string;
  userId: string;
  captureId: string;
  sourceText: string;
  correlationId: string;
  destination: "CALENDAR";
  operation: "CREATE_CALENDAR_PLAN";
  approvalMode: ProposalApprovalMode;
  state: StoredProposalState;
  plan: CalendarPlanInput;
  createdAt: string;
  appliedAt?: string;
  appliedEntityId?: string;
  appliedEventId?: string;
}

export interface CalendarPlanRecord {
  id: string;
  userId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  category: CalendarCategory;
  commitment: CalendarCommitment;
  createdAt: string;
  sourceProposalId: string;
}

export interface DomainEventRecord {
  eventId: string;
  userId: string;
  occurredAt: string;
  recordedAt: string;
  actorType: WriteActorType;
  actorId?: string;
  eventType: "CALENDAR_EVENT_CREATED";
  entityType: "calendar_event";
  entityId: string;
  source: WriteSource;
  correlationId: string;
  causationEventId?: string;
  payloadJson: Record<string, unknown>;
  schemaVersion: 1;
}

export interface AppliedProposalRecord {
  proposalId: string;
  appliedAt: string;
  confirmedByActorId: string;
  requestFingerprint: string;
  entityType: "calendar_event";
  entityId: string;
  eventId: string;
}

export interface CommitReceipt {
  proposalId: string;
  entityType: "calendar_event";
  entityId: string;
  eventId: string;
  appliedAt: string;
  idempotentReplay: boolean;
}

export interface WriteTransaction {
  getStoredCalendarProposalForUpdate(proposalId: string, userId: string): Promise<StoredCalendarProposal | undefined>;
  findAppliedProposal(proposalId: string): Promise<AppliedProposalRecord | undefined>;
  createCalendarPlan(record: CalendarPlanRecord): Promise<void>;
  appendDomainEvent(event: DomainEventRecord): Promise<void>;
  markProposalApplied(record: AppliedProposalRecord): Promise<void>;
  markStoredProposalApplied(proposalId: string, userId: string, appliedAt: string, entityId: string, eventId: string): Promise<void>;
}

export interface WriteUnitOfWork {
  run<T>(work: (transaction: WriteTransaction) => Promise<T>): Promise<T>;
}

export interface IdGenerator {
  next(prefix: "calendar" | "event"): string;
}

export interface Clock {
  now(): string;
}
