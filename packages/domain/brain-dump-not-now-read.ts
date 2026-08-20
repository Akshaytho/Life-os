import type {
  BrainDumpCategory,
  BrainDumpClassificationStatus,
  NotNowAssessment,
  NotNowPosture,
  NotNowState,
} from "../contracts/brain-dump-not-now";
import type { WriteSource } from "./write-boundary";

export interface BrainDumpReadRecord {
  captureId: string;
  userId: string;
  rawText: string;
  source: WriteSource;
  capturedAt: string;
  recordedAt: string;
  classificationId: string | null;
  category: BrainDumpCategory | null;
  classificationStatus: BrainDumpClassificationStatus | null;
  classificationConfirmedAt: string | null;
  classificationRecordedAt: string | null;
}

export interface NotNowReadRecord {
  itemId: string;
  rootId: string;
  revision: number;
  captureId: string;
  userId: string;
  rawText: string;
  source: WriteSource;
  assessment: NotNowAssessment;
  posture: NotNowPosture;
  state: NotNowState;
  reviewNote: string | null;
  decidedAt: string;
  recordedAt: string;
}

export interface BrainDumpNotNowReader {
  listBrainDumpItems(authenticatedUserId: string, limit: number): Promise<BrainDumpReadRecord[]>;
  listNotNowItems(authenticatedUserId: string, limit: number): Promise<NotNowReadRecord[]>;
}
