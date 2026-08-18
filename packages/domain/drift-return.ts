import type {
  DriftDecisionStatus,
  DriftExplanation,
  DriftLifecycleState,
  DriftReturnPosture,
} from "../contracts/drift-return";
import type { WriteRequestContext, WriteSource } from "./write-boundary";

export interface DriftOccurrenceRecord {
  driftId: string;
  userId: string;
  sourceNote?: string;
  occurredAt: string;
  recordedAt: string;
  correlationId: string;
  source: WriteSource;
  requestId: string;
  requestFingerprint: string;
}

export interface DriftDecisionRecord {
  decisionId: string;
  rootDecisionId: string;
  revision: number;
  driftId: string;
  userId: string;
  explanation: DriftExplanation;
  triggerNote?: string;
  emotionNote?: string;
  distractionNote?: string;
  returnPosture?: DriftReturnPosture;
  lifecycleState: Exclude<DriftLifecycleState, "RECORDED">;
  status: DriftDecisionStatus;
  decidedAt: string;
  recordedAt: string;
  endedAt?: string;
  supersedesDecisionId?: string;
  requestId: string;
  requestFingerprint: string;
}

interface DriftDomainEventBase {
  eventId: string;
  userId: string;
  occurredAt: string;
  recordedAt: string;
  actorType: "USER";
  actorId: string;
  source: WriteSource;
  correlationId: string;
  schemaVersion: 1;
}

export interface DriftRecordedDomainEventRecord extends DriftDomainEventBase {
  eventType: "DRIFT_RECORDED";
  entityType: "drift_occurrence";
  entityId: string;
  payloadJson: {
    lifecycleState: "RECORDED";
    authorityClass: "USER_SOURCE";
    hasSourceNote: boolean;
  };
}

export interface DriftUnderstandingDomainEventRecord extends DriftDomainEventBase {
  eventType: "DRIFT_UNDERSTANDING_CONFIRMED";
  entityType: "drift_decision";
  entityId: string;
  payloadJson: {
    driftId: string;
    rootDecisionId: string;
    revision: number;
    explanation: DriftExplanation;
    lifecycleState: "UNDERSTOOD" | "STILL_RETURNING";
    returnPosture?: "STILL_RETURNING";
    authorityClass: "DECISION";
    supersededDecisionId?: string;
  };
}

export interface DriftReturnDomainEventRecord extends DriftDomainEventBase {
  eventType: "DRIFT_RETURN_RECORDED";
  entityType: "drift_decision";
  entityId: string;
  payloadJson: {
    driftId: string;
    rootDecisionId: string;
    revision: number;
    explanation: DriftExplanation;
    returnPosture: "STILL_RETURNING";
    lifecycleState: "STILL_RETURNING";
    authorityClass: "DECISION";
    supersededDecisionId: string;
  };
}

export interface DriftResolvedDomainEventRecord extends DriftDomainEventBase {
  eventType: "DRIFT_RESOLVED";
  entityType: "drift_decision";
  entityId: string;
  payloadJson: {
    driftId: string;
    rootDecisionId: string;
    revision: number;
    explanation: DriftExplanation;
    returnPosture: Exclude<DriftReturnPosture, "STILL_RETURNING">;
    lifecycleState: "RESOLVED";
    authorityClass: "DECISION";
    supersededDecisionId: string;
  };
}

export type DriftDomainEventRecord =
  | DriftRecordedDomainEventRecord
  | DriftUnderstandingDomainEventRecord
  | DriftReturnDomainEventRecord
  | DriftResolvedDomainEventRecord;

export interface DriftTransaction {
  findOccurrenceByRequestId(requestId: string, userId: string): Promise<DriftOccurrenceRecord | undefined>;
  getOccurrenceForUpdate(driftId: string, userId: string): Promise<DriftOccurrenceRecord | undefined>;
  createOccurrence(record: DriftOccurrenceRecord): Promise<void>;
  findDecisionByRequestId(requestId: string, userId: string): Promise<DriftDecisionRecord | undefined>;
  getCurrentDecisionForUpdate(driftId: string, userId: string): Promise<DriftDecisionRecord | undefined>;
  supersedeCurrentDecision(decisionId: string, userId: string, endedAt: string): Promise<void>;
  createDecision(record: DriftDecisionRecord): Promise<void>;
  appendDomainEvent(event: DriftDomainEventRecord): Promise<void>;
}

export interface DriftUnitOfWork {
  run<T>(authenticatedUserId: string, work: (transaction: DriftTransaction) => Promise<T>): Promise<T>;
}

export interface DriftIdGenerator {
  next(prefix: "drift" | "drift-decision" | "event"): string;
}

export interface DriftClock {
  now(): string;
}

export type DriftRequestContext = WriteRequestContext;

export function lifecycleForReturnPosture(
  posture: DriftReturnPosture,
): "STILL_RETURNING" | "RESOLVED" {
  return posture === "STILL_RETURNING" ? "STILL_RETURNING" : "RESOLVED";
}

export function isTerminalDriftState(state: DriftLifecycleState): boolean {
  return state === "RESOLVED";
}
