export const brainDumpCategories = [
  "GOAL",
  "IDEA",
  "PROBLEM",
  "EMOTION",
  "PERSON",
  "CONCERN",
  "TASK",
  "LEARNING",
  "TRAVEL",
  "CONTENT",
  "CAREER",
  "DIET",
  "NOT_NOW",
] as const;

export type BrainDumpCategory = typeof brainDumpCategories[number];
export type BrainDumpClassificationStatus = "CURRENT" | "SUPERSEDED";

export const notNowAssessments = [
  "TEMPORARY_INSPIRATION",
  "WORTH_RESEARCHING",
  "GENUINE_DIRECTION_CHANGE",
  "EMOTIONAL_REACTION",
  "UNSURE",
] as const;

export type NotNowAssessment = typeof notNowAssessments[number];

export const notNowPostures = [
  "PARK_IT",
  "RESEARCH_WITHOUT_COMMITTING",
  "DELAY_DECISION",
] as const;

export type NotNowPosture = typeof notNowPostures[number];

export const notNowStates = [
  "PARKED_NOT_NOW",
  "RESEARCHING",
  "DELAYED",
  "DISMISSED",
  "RELEASED_FOR_REVIEW",
] as const;

export type NotNowState = typeof notNowStates[number];
export type NotNowRevisionStatus = "CURRENT" | "SUPERSEDED";

export interface BrainDumpClassification {
  id: string;
  category: BrainDumpCategory;
  status: BrainDumpClassificationStatus;
  authorityClass: "DECISION";
  confirmedAt: string;
  recordedAt: string;
  endedAt?: string;
}

export interface BrainDumpItem {
  captureId: string;
  rawText: string;
  source: "WEB_APP" | "MCP" | "SCHEDULED_JOB" | "AI_CHAT" | "IMPORT";
  authorityClass: "USER_SOURCE";
  capturedAt: string;
  recordedAt: string;
  currentClassification: BrainDumpClassification | null;
}

export interface BrainDumpOverview {
  items: BrainDumpItem[];
}

export interface ConfirmBrainDumpClassificationCommand {
  category: BrainDumpCategory;
  expectedCurrentClassificationId: string | null;
}

export interface BrainDumpClassificationReceipt {
  classificationId: string;
  captureId: string;
  category: BrainDumpCategory;
  status: "CURRENT";
  authorityClass: "DECISION";
  confirmedAt: string;
  recordedAt: string;
  supersededClassificationId?: string;
  idempotentReplay: boolean;
}

export interface NotNowItem {
  id: string;
  rootId: string;
  revision: number;
  captureId: string;
  rawText: string;
  source: BrainDumpItem["source"];
  category: "NOT_NOW";
  assessment: NotNowAssessment;
  posture: NotNowPosture;
  state: NotNowState;
  status: "CURRENT";
  authorityClass: "DECISION";
  reviewNote?: string;
  decidedAt: string;
  recordedAt: string;
}

export interface NotNowOverview {
  items: NotNowItem[];
}

export interface ParkNotNowItemCommand {
  captureId: string;
  classificationId: string;
  assessment: NotNowAssessment;
  posture: NotNowPosture;
  expectedCurrentItemId: null;
}

export interface ReviewNotNowItemCommand {
  targetState: NotNowState;
  reviewNote?: string;
  expectedCurrentRevision: number;
}

export interface NotNowItemReceipt {
  itemId: string;
  rootId: string;
  captureId: string;
  revision: number;
  state: NotNowState;
  status: "CURRENT";
  authorityClass: "DECISION";
  decidedAt: string;
  recordedAt: string;
  supersededItemId?: string;
  idempotentReplay: boolean;
}
