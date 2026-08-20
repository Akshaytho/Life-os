export const memoryKinds = [
  "LEARNING",
  "EXPERIENCE",
  "REFLECTION",
  "PERSON_CONTEXT",
  "DECISION_HISTORY",
] as const;

export type MemoryKind = typeof memoryKinds[number];
export type MemoryAuthority = "REFLECTION";
export type MemoryStatus = "CURRENT" | "SUPERSEDED";
export type MemorySourceDomain = "PERIODIC_REVIEW" | "JOURNEY_PRACTICE";
export type MemoryRelationship = "NEW" | "REINFORCES" | "MODIFIES" | "CONTRADICTS";

export interface MemorySource {
  domain: MemorySourceDomain;
  entityId: string;
  label: string;
  occurredAt: string;
  authorityClass: "REFLECTION";
}

export interface MemoryCandidate extends MemorySource {
  candidateId: string;
  suggestedTitle: string;
  body: string;
  retainedRootId?: string;
}

export interface MemoryVersion {
  itemId: string;
  revision: number;
  kind: MemoryKind;
  title: string;
  body: string;
  authorityClass: MemoryAuthority;
  relationship: MemoryRelationship;
  relatedRootId?: string;
  status: MemoryStatus;
  retainedAt: string;
  recordedAt: string;
  endedAt?: string;
}

export interface MemoryItem extends MemoryVersion {
  rootId: string;
  status: "CURRENT";
  source: MemorySource;
  relatedTitle?: string;
  history: MemoryVersion[];
}

export interface MemoryTrustedReference {
  referenceId: string;
  owner: "YOU" | "JOURNEY" | "CALENDAR";
  authorityClass: "DECISION" | "CURRENT_STATE" | "FACT";
  label: string;
  value: string;
  detail?: string;
  sourceEntityId: string;
  occurredAt: string;
  href?: string;
}

export interface MemoryCompressedReview {
  reviewId: string;
  kind: "WEEK" | "MONTH";
  periodStart: string;
  periodEnd: string;
  title: string;
  summary: string;
  authorityClass: "REFLECTION";
  href: string;
}

export interface MemoryTimeCompression {
  month: MemoryCompressedReview | null;
  weeks: MemoryCompressedReview[];
}

export interface MemoryOverview {
  query?: string;
  kind?: MemoryKind;
  trustedNow: MemoryTrustedReference[];
  candidates: MemoryCandidate[];
  items: MemoryItem[];
  timeCompression: MemoryTimeCompression;
  patterns: [];
}

export interface GetMemoryOverviewCommand {
  timeZone: string;
  now: string;
  query?: string;
  kind?: MemoryKind;
}

export interface RetainMemoryItemCommand {
  sourceDomain: MemorySourceDomain;
  sourceEntityId: string;
  kind: MemoryKind;
  title: string;
  body: string;
  relationship: MemoryRelationship;
  relatedRootId?: string;
}

export interface ReviseMemoryItemCommand {
  expectedCurrentItemId: string;
  kind: MemoryKind;
  title: string;
  body: string;
}

export interface MemoryWriteReceipt {
  itemId: string;
  rootId: string;
  revision: number;
  status: MemoryStatus;
  authorityClass: MemoryAuthority;
  sourceDomain: MemorySourceDomain;
  sourceEntityId: string;
  relationship: MemoryRelationship;
  retainedAt: string;
  recordedAt: string;
  supersededItemId?: string;
  idempotentReplay: boolean;
}
