import type { DirectionDecisionStatus } from "../contracts/direction";
import type { WriteRequestContext, WriteSource } from "./write-boundary";

export interface DirectionDecisionRecord {
  directionId: string;
  userId: string;
  statement: string;
  status: DirectionDecisionStatus;
  decidedAt: string;
  recordedAt: string;
  endedAt?: string;
  supersedesDirectionId?: string;
  requestId: string;
  requestFingerprint: string;
}

export interface DirectionDecisionDomainEventRecord {
  eventId: string;
  userId: string;
  occurredAt: string;
  recordedAt: string;
  actorType: "USER";
  actorId: string;
  eventType: "DIRECTION_DECISION_ACTIVATED";
  entityType: "direction_decision";
  entityId: string;
  source: WriteSource;
  correlationId: string;
  payloadJson: {
    authorityClass: "DECISION";
    statement: string;
    supersededDirectionId?: string;
  };
  schemaVersion: 1;
}

export interface DirectionDecisionTransaction {
  findByRequestId(requestId: string, userId: string): Promise<DirectionDecisionRecord | undefined>;
  getActiveForUpdate(userId: string): Promise<DirectionDecisionRecord | undefined>;
  supersedeActive(directionId: string, userId: string, endedAt: string): Promise<void>;
  createDirection(record: DirectionDecisionRecord): Promise<void>;
  appendDomainEvent(event: DirectionDecisionDomainEventRecord): Promise<void>;
}

export interface DirectionDecisionUnitOfWork {
  run<T>(authenticatedUserId: string, work: (transaction: DirectionDecisionTransaction) => Promise<T>): Promise<T>;
}

export interface DirectionDecisionIdGenerator {
  next(prefix: "direction" | "event"): string;
}

export interface DirectionDecisionClock {
  now(): string;
}

export type DirectionDecisionRequestContext = WriteRequestContext;
