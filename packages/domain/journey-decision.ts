import type { JourneyDecisionStatus } from "../contracts/journey";
import type { WriteRequestContext, WriteSource } from "./write-boundary";

export interface JourneyDecisionRecord {
  journeyId: string;
  userId: string;
  name: string;
  activeCapability: string;
  status: JourneyDecisionStatus;
  decidedAt: string;
  recordedAt: string;
  endedAt?: string;
  supersedesJourneyId?: string;
  requestId: string;
  requestFingerprint: string;
}

export interface JourneyDecisionDomainEventRecord {
  eventId: string;
  userId: string;
  occurredAt: string;
  recordedAt: string;
  actorType: "USER";
  actorId: string;
  eventType: "JOURNEY_DECISION_ACTIVATED";
  entityType: "journey_decision";
  entityId: string;
  source: WriteSource;
  correlationId: string;
  payloadJson: {
    authorityClass: "DECISION";
    name: string;
    activeCapability: string;
    supersededJourneyId?: string;
  };
  schemaVersion: 1;
}

export interface JourneyDecisionTransaction {
  findByRequestId(requestId: string, userId: string): Promise<JourneyDecisionRecord | undefined>;
  getActiveForUpdate(userId: string): Promise<JourneyDecisionRecord | undefined>;
  supersedeActive(journeyId: string, userId: string, endedAt: string): Promise<void>;
  createJourney(record: JourneyDecisionRecord): Promise<void>;
  appendDomainEvent(event: JourneyDecisionDomainEventRecord): Promise<void>;
}

export interface JourneyDecisionUnitOfWork {
  run<T>(authenticatedUserId: string, work: (transaction: JourneyDecisionTransaction) => Promise<T>): Promise<T>;
}

export interface JourneyDecisionIdGenerator {
  next(prefix: "journey" | "event"): string;
}

export interface JourneyDecisionClock {
  now(): string;
}

export type JourneyDecisionRequestContext = WriteRequestContext;
