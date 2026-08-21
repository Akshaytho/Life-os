import type {
  ManualCalendarCategory,
  ManualCalendarCommitment,
} from "../contracts/manual-calendar";
import type { DomainEventRecord, WriteRequestContext } from "./write-boundary";

export interface ManualCalendarRecord {
  id: string;
  userId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  category: ManualCalendarCategory;
  commitment: ManualCalendarCommitment;
  createdAt: string;
  sourceKey: string;
}

export interface ManualCalendarTransaction {
  findBySourceKey(sourceKey: string, userId: string): Promise<ManualCalendarRecord | undefined>;
  create(record: ManualCalendarRecord): Promise<void>;
  appendDomainEvent(event: DomainEventRecord): Promise<void>;
}

export interface ManualCalendarUnitOfWork {
  run<T>(authenticatedUserId: string, work: (transaction: ManualCalendarTransaction) => Promise<T>): Promise<T>;
}

export interface ManualCalendarClock { now(): string; }
export interface ManualCalendarIdGenerator { next(prefix: "calendar" | "event"): string; }

export interface ManualCalendarWriteContext extends WriteRequestContext {}
