import type {
  BrainDumpOverview,
  NotNowOverview,
} from "../../../packages/contracts/brain-dump-not-now";
import type { BrainDumpNotNowReader } from "../../../packages/domain/brain-dump-not-now-read";
import { BrainDumpNotNowError, requiredBrainDumpOpaqueId } from "./brain-dump-not-now-validation";

const readLimit = 100;

export async function getBrainDumpOverview(
  authenticatedUserId: string,
  reader: BrainDumpNotNowReader,
): Promise<BrainDumpOverview> {
  const userId = requiredBrainDumpOpaqueId(authenticatedUserId, "INVALID_PRINCIPAL");
  const rows = await reader.listBrainDumpItems(userId, readLimit + 1);
  if (rows.length > readLimit) throw new BrainDumpNotNowError("INVALID_CAPTURE");
  return {
    items: rows.map((row) => ({
      captureId: row.captureId,
      rawText: row.rawText,
      source: row.source,
      authorityClass: "USER_SOURCE",
      capturedAt: row.capturedAt,
      recordedAt: row.recordedAt,
      currentClassification: row.classificationId && row.category
        && row.classificationStatus && row.classificationConfirmedAt
        && row.classificationRecordedAt
        ? {
          id: row.classificationId,
          category: row.category,
          status: row.classificationStatus,
          authorityClass: "DECISION",
          confirmedAt: row.classificationConfirmedAt,
          recordedAt: row.classificationRecordedAt,
        }
        : null,
    })),
  };
}

export async function getNotNowOverview(
  authenticatedUserId: string,
  reader: BrainDumpNotNowReader,
): Promise<NotNowOverview> {
  const userId = requiredBrainDumpOpaqueId(authenticatedUserId, "INVALID_PRINCIPAL");
  const rows = await reader.listNotNowItems(userId, readLimit + 1);
  if (rows.length > readLimit) throw new BrainDumpNotNowError("INVALID_NOT_NOW_ITEM");
  return {
    items: rows.map((row) => ({
      id: row.itemId,
      rootId: row.rootId,
      revision: row.revision,
      captureId: row.captureId,
      rawText: row.rawText,
      source: row.source,
      category: "NOT_NOW",
      assessment: row.assessment,
      posture: row.posture,
      state: row.state,
      status: "CURRENT",
      authorityClass: "DECISION",
      ...(row.reviewNote ? { reviewNote: row.reviewNote } : {}),
      decidedAt: row.decidedAt,
      recordedAt: row.recordedAt,
    })),
  };
}
