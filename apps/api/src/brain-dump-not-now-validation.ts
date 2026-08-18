import {
  brainDumpCategories,
  notNowAssessments,
  notNowPostures,
  notNowStates,
  type BrainDumpCategory,
  type NotNowAssessment,
  type NotNowPosture,
  type NotNowState,
} from "../../../packages/contracts/brain-dump-not-now";

export type BrainDumpNotNowErrorCode =
  | "INVALID_PRINCIPAL"
  | "INVALID_CAPTURE"
  | "INVALID_CLASSIFICATION"
  | "INVALID_CATEGORY"
  | "INVALID_NOT_NOW_ITEM"
  | "INVALID_ASSESSMENT"
  | "INVALID_POSTURE"
  | "INVALID_NOT_NOW_STATE"
  | "INVALID_REVIEW_NOTE"
  | "IDEMPOTENCY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "CAPTURE_NOT_FOUND"
  | "CURRENT_CLASSIFICATION_CHANGED"
  | "CLASSIFICATION_UNCHANGED"
  | "NOT_NOW_CLASSIFICATION_REQUIRED"
  | "NOT_NOW_ITEM_EXISTS"
  | "NOT_NOW_ITEM_NOT_FOUND"
  | "NOT_NOW_ITEM_CHANGED"
  | "NOT_NOW_TRANSITION_NOT_ALLOWED";

export class BrainDumpNotNowError extends Error {
  constructor(readonly code: BrainDumpNotNowErrorCode) {
    super(code);
    this.name = "BrainDumpNotNowError";
  }
}

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const validCategories = new Set<BrainDumpCategory>(brainDumpCategories);
const validAssessments = new Set<NotNowAssessment>(notNowAssessments);
const validPostures = new Set<NotNowPosture>(notNowPostures);
const validStates = new Set<NotNowState>(notNowStates);

export function requiredBrainDumpOpaqueId(
  value: string,
  code: BrainDumpNotNowErrorCode,
): string {
  const normalized = value.trim();
  if (!opaqueIdPattern.test(normalized)) throw new BrainDumpNotNowError(code);
  return normalized;
}

export function requiredBrainDumpRequestId(
  value: string,
  scope: "brain_dump_classify" | "not_now_park" | "not_now_review",
): string {
  const normalized = requiredBrainDumpOpaqueId(value, "IDEMPOTENCY_REQUIRED");
  const prefix = `web-idem-v1:${scope}:`;
  if (!normalized.startsWith(prefix) || !/^[0-9a-f]{64}$/.test(normalized.slice(prefix.length))) {
    throw new BrainDumpNotNowError("IDEMPOTENCY_REQUIRED");
  }
  return normalized;
}

export function normalizedBrainDumpCategory(value: BrainDumpCategory): BrainDumpCategory {
  if (!validCategories.has(value)) throw new BrainDumpNotNowError("INVALID_CATEGORY");
  return value;
}

export function normalizedNotNowAssessment(value: NotNowAssessment): NotNowAssessment {
  if (!validAssessments.has(value)) throw new BrainDumpNotNowError("INVALID_ASSESSMENT");
  return value;
}

export function normalizedNotNowPosture(value: NotNowPosture): NotNowPosture {
  if (!validPostures.has(value)) throw new BrainDumpNotNowError("INVALID_POSTURE");
  return value;
}

export function normalizedNotNowState(value: NotNowState): NotNowState {
  if (!validStates.has(value)) throw new BrainDumpNotNowError("INVALID_NOT_NOW_STATE");
  return value;
}

export function normalizedNotNowReviewNote(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 4000) {
    throw new BrainDumpNotNowError("INVALID_REVIEW_NOTE");
  }
  return normalized;
}

export function normalizedBrainDumpInstant(
  value: string,
  code: "INVALID_CLASSIFICATION" | "INVALID_NOT_NOW_ITEM",
): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new BrainDumpNotNowError(code);
  return new Date(milliseconds).toISOString();
}

export function normalizedExpectedRevision(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) {
    throw new BrainDumpNotNowError("INVALID_NOT_NOW_ITEM");
  }
  return value;
}
