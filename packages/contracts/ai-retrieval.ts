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
] as const;

export type AiContextDomain = typeof aiContextDomains[number];

export const aiContextAuthorityClasses = [
  "DECISION",
  "FACT",
  "REFLECTION",
  "USER_SOURCE",
] as const;

export type AiContextAuthorityClass = typeof aiContextAuthorityClasses[number];

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
}

export interface AskLifeOsResponse {
  mode: AiInteractionMode;
  answer: string;
  answerAuthority: "AI_OBSERVATION";
  citedSourceIds: string[];
  sources: AiContextSource[];
  generatedAt: string;
  policyVersion: "ask-life-os-retrieval-v1";
  modelName: string;
}
