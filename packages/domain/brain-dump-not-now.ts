import type {
  BrainDumpCategory,
  BrainDumpClassificationStatus,
  NotNowAssessment,
  NotNowPosture,
  NotNowRevisionStatus,
  NotNowState,
} from "../contracts/brain-dump-not-now";
import type { WriteRequestContext, WriteSource } from "./write-boundary";

export interface BrainDumpCaptureRecord {
  captureId: string;
  userId: string;
  rawText: string;
  source: WriteSource;
  receivedAt: string;
  recordedAt: string;
}

export interface BrainDumpClassificationRecord {
  classificationId: string;
  captureId: string;
  userId: string;
  category: BrainDumpCategory;
  status: BrainDumpClassificationStatus;
  confirmedAt: string;
  recordedAt: string;
  endedAt?: string;
  supersedesClassificationId?: string;
  requestId: string;
  requestFingerprint: string;
}

export interface NotNowItemRecord {
  itemId: string;
  rootId: string;
  revision: number;
  captureId: string;
  classificationId: string;
  userId: string;
  assessment: NotNowAssessment;
  posture: NotNowPosture;
  state: NotNowState;
  status: NotNowRevisionStatus;
  reviewNote?: string;
  decidedAt: string;
  recordedAt: string;
  endedAt?: string;
  supersedesItemId?: string;
  requestId: string;
  requestFingerprint: string;
}

interface BrainDumpDomainEventBase {
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

export interface BrainDumpClassificationDomainEventRecord extends BrainDumpDomainEventBase {
  eventType: "BRAIN_DUMP_CLASSIFICATION_CONFIRMED";
  entityType: "brain_dump_classification";
  entityId: string;
  payloadJson: {
    captureId: string;
    category: BrainDumpCategory;
    authorityClass: "DECISION";
    supersededClassificationId?: string;
  };
}

export interface NotNowParkedDomainEventRecord extends BrainDumpDomainEventBase {
  eventType: "NOT_NOW_ITEM_PARKED";
  entityType: "not_now_item";
  entityId: string;
  payloadJson: {
    captureId: string;
    rootId: string;
    revision: 1;
    assessment: NotNowAssessment;
    posture: NotNowPosture;
    state: NotNowState;
    authorityClass: "DECISION";
  };
}

export interface NotNowReviewedDomainEventRecord extends BrainDumpDomainEventBase {
  eventType: "NOT_NOW_ITEM_REVIEWED";
  entityType: "not_now_item";
  entityId: string;
  payloadJson: {
    captureId: string;
    rootId: string;
    revision: number;
    previousState: NotNowState;
    state: NotNowState;
    posture: NotNowPosture;
    authorityClass: "DECISION";
    reviewNote?: string;
    supersededItemId: string;
  };
}

export type BrainDumpNotNowDomainEventRecord =
  | BrainDumpClassificationDomainEventRecord
  | NotNowParkedDomainEventRecord
  | NotNowReviewedDomainEventRecord;

export interface BrainDumpNotNowTransaction {
  getCaptureForUpdate(captureId: string, userId: string): Promise<BrainDumpCaptureRecord | undefined>;
  findClassificationByRequestId(requestId: string, userId: string): Promise<BrainDumpClassificationRecord | undefined>;
  getCurrentClassificationForUpdate(captureId: string, userId: string): Promise<BrainDumpClassificationRecord | undefined>;
  supersedeCurrentClassification(classificationId: string, userId: string, endedAt: string): Promise<void>;
  createClassification(record: BrainDumpClassificationRecord): Promise<void>;
  findNotNowItemByRequestId(requestId: string, userId: string): Promise<NotNowItemRecord | undefined>;
  getCurrentNotNowItemForCapture(captureId: string, userId: string): Promise<NotNowItemRecord | undefined>;
  getCurrentNotNowItemForUpdate(rootId: string, userId: string): Promise<NotNowItemRecord | undefined>;
  supersedeCurrentNotNowItem(itemId: string, userId: string, endedAt: string): Promise<void>;
  createNotNowItem(record: NotNowItemRecord): Promise<void>;
  appendDomainEvent(event: BrainDumpNotNowDomainEventRecord): Promise<void>;
}

export interface BrainDumpNotNowUnitOfWork {
  run<T>(authenticatedUserId: string, work: (transaction: BrainDumpNotNowTransaction) => Promise<T>): Promise<T>;
}

export interface BrainDumpNotNowIdGenerator {
  next(prefix: "classification" | "not-now" | "event"): string;
}

export interface BrainDumpNotNowClock {
  now(): string;
}

export type BrainDumpNotNowRequestContext = WriteRequestContext;

export function initialNotNowState(posture: NotNowPosture): NotNowState {
  if (posture === "RESEARCH_WITHOUT_COMMITTING") return "RESEARCHING";
  if (posture === "DELAY_DECISION") return "DELAYED";
  return "PARKED_NOT_NOW";
}

export function postureForReviewedState(
  targetState: NotNowState,
  currentPosture: NotNowPosture,
): NotNowPosture {
  if (targetState === "RESEARCHING") return "RESEARCH_WITHOUT_COMMITTING";
  if (targetState === "DELAYED") return "DELAY_DECISION";
  if (targetState === "PARKED_NOT_NOW") return "PARK_IT";
  return currentPosture;
}

export function canReviewNotNowState(current: NotNowState, target: NotNowState): boolean {
  if (current === "DISMISSED" || current === "RELEASED_FOR_REVIEW") return false;
  return current !== target;
}
