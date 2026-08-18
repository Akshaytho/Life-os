export const aiInteractionModes = [
  "ASK",
  "REFLECT",
  "DECIDE",
  "REVIEW",
  "RESET",
  "PLAN",
  "CHALLENGE",
] as const;

export type AiInteractionMode = typeof aiInteractionModes[number];

export const aiContextDomains = [
  "YOU",
  "CALENDAR",
  "REVIEWS",
  "NOT_NOW",
  "DRIFT",
  "JOURNEY",
  "MEMORY",
] as const;

export type AiContextDomain = typeof aiContextDomains[number];

export const aiContextAuthorityClasses = [
  "DECISION",
  "FACT",
  "REFLECTION",
  "USER_SOURCE",
] as const;

export type AiContextAuthorityClass = typeof aiContextAuthorityClasses[number];

export interface AiMemoryProvenance {
  rootId: string;
  itemId: string;
  revision: number;
  kind: import("./memory").MemoryKind;
  relationship: import("./memory").MemoryRelationship;
  relatedRootId?: string;
  sourceDomain: import("./memory").MemorySourceDomain;
  sourceEntityId: string;
  sourceLabel: string;
  sourceOccurredAt: string;
}

export interface AskLifeOsCommand {
  mode: AiInteractionMode;
  question: string;
  localDate: string;
  timeZone: string;
  calendarFrom: string;
  calendarTo: string;
}

export interface AiContextSource {
  sourceId: string;
  domain: AiContextDomain;
  authorityClass: AiContextAuthorityClass;
  title: string;
  excerpt: string;
  occurredAt: string;
  memoryProvenance?: AiMemoryProvenance;
}

export interface AskLifeOsResponse {
  mode: AiInteractionMode;
  answer: string;
  answerAuthority: "AI_OBSERVATION";
  citedSourceIds: string[];
  sources: AiContextSource[];
  generatedAt: string;
  policyVersion: "ask-life-os-retrieval-v1.1";
  modelName: string;
}
