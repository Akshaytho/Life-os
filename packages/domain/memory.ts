import type {
  MemoryKind,
  MemoryRelationship,
  MemorySourceDomain,
  MemoryStatus,
} from "../contracts/memory";
import type { WriteRequestContext, WriteSource } from "./write-boundary";

export interface MemoryCandidateRecord {
  userId: string;
  sourceDomain: MemorySourceDomain;
  sourceEntityId: string;
  sourceLabel: string;
  sourceBody: string;
  sourceOccurredAt: string;
}

export interface MemoryItemRecord {
  itemId: string;
  rootId: string;
  revision: number;
  userId: string;
  kind: MemoryKind;
  title: string;
  body: string;
  relationship: MemoryRelationship;
  relatedRootId?: string;
  sourceDomain: MemorySourceDomain;
  sourceEntityId: string;
  sourceOccurredAt: string;
  status: MemoryStatus;
  retainedAt: string;
  recordedAt: string;
  endedAt?: string;
  supersedesItemId?: string;
  requestId: string;
  requestFingerprint: string;
}

export interface MemoryDomainEventRecord {
  eventId: string;
  userId: string;
  occurredAt: string;
  recordedAt: string;
  actorType: "USER";
  actorId: string;
  eventType: "MEMORY_ITEM_RETAINED" | "MEMORY_ITEM_REVISED";
  entityType: "memory_item";
  entityId: string;
  source: WriteSource;
  correlationId: string;
  payloadJson: {
    rootId: string;
    revision: number;
    kind: MemoryKind;
    authorityClass: "REFLECTION";
    sourceDomain: MemorySourceDomain;
    sourceEntityId: string;
    relationship: MemoryRelationship;
    relatedRootId?: string;
    supersededItemId?: string;
  };
  schemaVersion: 1;
}

export interface MemoryTransaction {
  findByRequestId(requestId: string, userId: string): Promise<MemoryItemRecord | undefined>;
  getCandidateForUpdate(
    userId: string,
    sourceDomain: MemorySourceDomain,
    sourceEntityId: string,
  ): Promise<MemoryCandidateRecord | undefined>;
  getCurrentBySourceForUpdate(
    userId: string,
    sourceDomain: MemorySourceDomain,
    sourceEntityId: string,
  ): Promise<MemoryItemRecord | undefined>;
  getCurrentByRootForUpdate(userId: string, rootId: string): Promise<MemoryItemRecord | undefined>;
  supersede(itemId: string, userId: string, endedAt: string): Promise<void>;
  create(record: MemoryItemRecord): Promise<void>;
  appendDomainEvent(event: MemoryDomainEventRecord): Promise<void>;
}

export interface MemoryUnitOfWork {
  run<T>(authenticatedUserId: string, work: (transaction: MemoryTransaction) => Promise<T>): Promise<T>;
}

export interface MemoryClock { now(): string }
export interface MemoryIdGenerator { next(prefix: "memory-item" | "event"): string }
export type MemoryRequestContext = WriteRequestContext;
