export type MemoryOwner = "YOU" | "JOURNEY" | "CALENDAR" | "MEMORY";

export type MemoryAuthority =
  | "DECISION"
  | "CURRENT STATE"
  | "FACT"
  | "REFLECTION"
  | "DERIVED SUMMARY"
  | "DERIVED PATTERN";

export type MemoryKind = "LEARNING" | "EXPERIENCE" | "REFLECTION" | "DECISION HISTORY";

export interface MemorySourceRef {
  label: string;
  detail?: string;
  recordedAt: string;
}

export interface MemoryAnchor {
  id: string;
  label: string;
  value: string;
  detail: string;
  owner: MemoryOwner;
  authority: MemoryAuthority;
  source: MemorySourceRef;
  href?: string;
}

export interface MeaningfulMemory {
  id: string;
  kind: MemoryKind;
  date: string;
  title: string;
  summary: string;
  authority: MemoryAuthority;
  source: MemorySourceRef;
}

export interface CompressedWeek {
  id: string;
  range: string;
  title: string;
  summary: string;
  signals: string[];
}

export interface CompressedMonth {
  label: string;
  title: string;
  summary: string;
  authority: "DERIVED SUMMARY";
  source: MemorySourceRef;
  weeks: CompressedWeek[];
}

export interface DerivedPattern {
  id: string;
  title: string;
  statement: string;
  evidenceWindow: string;
  evidence: string;
  authority: "DERIVED PATTERN";
  source: MemorySourceRef;
}

export interface MemoryViewModel {
  demoMode: boolean;
  recallPrompt: string;
  recallExplanation: string;
  anchors: MemoryAnchor[];
  memories: MeaningfulMemory[];
  month: CompressedMonth;
  patterns: DerivedPattern[];
}
