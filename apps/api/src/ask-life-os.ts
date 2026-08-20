import {
  aiInteractionModes,
  type AiContextAuthorityClass,
  type AiContextDomain,
  type AiContextSource,
  type AiInteractionMode,
  type AskLifeOsCommand,
  type AskLifeOsResponse,
} from "../../../packages/contracts/ai-retrieval";
import type { MemoryItem } from "../../../packages/contracts/memory";
import type { BrainDumpNotNowReader } from "../../../packages/domain/brain-dump-not-now-read";
import type { CanonicalCalendarReader } from "../../../packages/domain/canonical-calendar-read";
import type { DailyReturnReader } from "../../../packages/domain/daily-return-read";
import type { DirectionDecisionReader } from "../../../packages/domain/direction-read";
import type { DriftReader } from "../../../packages/domain/drift-return-read";
import type { JourneyPracticeReader } from "../../../packages/domain/journey-practice-read";
import type { MemoryReader } from "../../../packages/domain/memory-read";
import type { AuthenticatedUserPrincipal } from "../../../packages/domain/write-boundary";
import type { LifeOsAssistant } from "../../../packages/intelligence/life-os-assistant";
import { getCanonicalCalendar } from "./get-canonical-calendar";
import { getDailyReturnOverview } from "./get-daily-return-overview";
import { getDirectionOverview } from "./get-direction-overview";
import { getDriftOverview } from "./get-drift-overview";
import { getNotNowOverview } from "./get-brain-dump-not-now-overviews";
import { getJourneyPracticeOverview } from "./get-journey-practice-overview";

export type AiRetrievalErrorCode =
  | "INVALID_PRINCIPAL"
  | "INVALID_REQUEST"
  | "CONTEXT_UNAVAILABLE"
  | "AI_RESPONSE_INVALID";

export class AiRetrievalError extends Error {
  constructor(readonly code: AiRetrievalErrorCode) {
    super(code);
    this.name = "AiRetrievalError";
  }
}

export interface AiRetrievalClock {
  now(): string;
}

export interface AskLifeOsDependencies {
  assistant: LifeOsAssistant;
  directionReader: DirectionDecisionReader;
  calendarReader: CanonicalCalendarReader;
  dailyReturnReader: DailyReturnReader;
  brainDumpNotNowReader: BrainDumpNotNowReader;
  driftReader: DriftReader;
  journeyPracticeReader: JourneyPracticeReader;
  memoryReader?: MemoryReader;
  clock: AiRetrievalClock;
}

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const zonedTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const maxCalendarWindowMs = 14 * 24 * 60 * 60 * 1000;
const maxSources = 24;
const maxMemorySources = 6;
const maxExcerptLength = 480;
const policyVersion = "ask-life-os-retrieval-v1.1" as const;

const domainOrder: Record<AiInteractionMode, readonly AiContextDomain[]> = {
  ASK: ["YOU", "JOURNEY", "CALENDAR", "MEMORY", "REVIEWS", "DRIFT", "NOT_NOW"],
  REFLECT: ["REVIEWS", "MEMORY", "JOURNEY", "DRIFT", "YOU", "CALENDAR", "NOT_NOW"],
  DECIDE: ["YOU", "CALENDAR", "JOURNEY", "NOT_NOW", "MEMORY", "REVIEWS", "DRIFT"],
  REVIEW: ["REVIEWS", "CALENDAR", "JOURNEY", "MEMORY", "DRIFT", "YOU", "NOT_NOW"],
  RESET: ["YOU", "DRIFT", "JOURNEY", "CALENDAR", "MEMORY", "REVIEWS", "NOT_NOW"],
  PLAN: ["CALENDAR", "YOU", "JOURNEY", "MEMORY", "REVIEWS", "NOT_NOW", "DRIFT"],
  CHALLENGE: ["YOU", "DRIFT", "NOT_NOW", "MEMORY", "REVIEWS", "JOURNEY", "CALENDAR"],
};

const authorityOrder: Record<AiContextAuthorityClass, number> = {
  DECISION: 0,
  FACT: 1,
  REFLECTION: 2,
  USER_SOURCE: 3,
};

const validMemoryKinds = new Set(["LEARNING", "EXPERIENCE", "REFLECTION", "PERSON_CONTEXT", "DECISION_HISTORY"]);
const validMemoryRelationships = new Set(["NEW", "REINFORCES", "MODIFIES", "CONTRADICTS"]);
const validMemorySourceDomains = new Set(["PERIODIC_REVIEW", "JOURNEY_PRACTICE"]);

function requiredUserId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new AiRetrievalError("INVALID_PRINCIPAL");
  return normalized;
}

function normalizedMode(value: AiInteractionMode): AiInteractionMode {
  if (!aiInteractionModes.includes(value)) throw new AiRetrievalError("INVALID_REQUEST");
  return value;
}

function normalizedQuestion(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 2_000) throw new AiRetrievalError("INVALID_REQUEST");
  return normalized;
}

function normalizedLocalDate(value: string): string {
  const normalized = value.trim();
  if (!localDatePattern.test(normalized)) throw new AiRetrievalError("INVALID_REQUEST");
  const [year, month, day] = normalized.split("-").map(Number);
  const instant = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    instant.getUTCFullYear() !== year
    || instant.getUTCMonth() + 1 !== month
    || instant.getUTCDate() !== day
  ) throw new AiRetrievalError("INVALID_REQUEST");
  return normalized;
}

function normalizedTimeZone(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 100) throw new AiRetrievalError("INVALID_REQUEST");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date(0));
  } catch {
    throw new AiRetrievalError("INVALID_REQUEST");
  }
  return normalized;
}

function normalizedTimestamp(value: string): string {
  const normalized = value.trim();
  if (!zonedTimestampPattern.test(normalized)) throw new AiRetrievalError("INVALID_REQUEST");
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) throw new AiRetrievalError("INVALID_REQUEST");
  return new Date(milliseconds).toISOString();
}

function validatedCommand(command: AskLifeOsCommand): AskLifeOsCommand {
  const calendarFrom = normalizedTimestamp(command.calendarFrom);
  const calendarTo = normalizedTimestamp(command.calendarTo);
  const duration = Date.parse(calendarTo) - Date.parse(calendarFrom);
  if (duration <= 0 || duration > maxCalendarWindowMs) {
    throw new AiRetrievalError("INVALID_REQUEST");
  }
  return {
    mode: normalizedMode(command.mode),
    question: normalizedQuestion(command.question),
    localDate: normalizedLocalDate(command.localDate),
    timeZone: normalizedTimeZone(command.timeZone),
    calendarFrom,
    calendarTo,
  };
}

function previousLocalDates(current: string): string[] {
  const [year, month, day] = current.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(date);
    value.setUTCDate(value.getUTCDate() - index);
    return value.toISOString().slice(0, 10);
  });
}

function compact(value: string, limit = maxExcerptLength): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new AiRetrievalError("AI_RESPONSE_INVALID");
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function optionalCompact(value: string | undefined | null, limit?: number): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? compact(normalized, limit) : undefined;
}

function contextSource(input: AiContextSource): AiContextSource {
  if (
    !input.sourceId.trim()
    || input.sourceId.length > 300
    || !Number.isFinite(Date.parse(input.occurredAt))
  ) throw new AiRetrievalError("AI_RESPONSE_INVALID");
  const memoryProvenance = input.memoryProvenance;
  if (memoryProvenance && (
    input.domain !== "MEMORY"
    || input.authorityClass !== "REFLECTION"
    || !memoryProvenance.rootId.trim()
    || !memoryProvenance.itemId.trim()
    || !Number.isInteger(memoryProvenance.revision)
    || memoryProvenance.revision < 1
    || !validMemoryKinds.has(memoryProvenance.kind)
    || !validMemoryRelationships.has(memoryProvenance.relationship)
    || !validMemorySourceDomains.has(memoryProvenance.sourceDomain)
    || !memoryProvenance.sourceEntityId.trim()
    || !memoryProvenance.sourceLabel.trim()
    || !Number.isFinite(Date.parse(memoryProvenance.sourceOccurredAt))
    || (memoryProvenance.relatedRootId !== undefined && !memoryProvenance.relatedRootId.trim())
  )) throw new AiRetrievalError("AI_RESPONSE_INVALID");
  return {
    ...input,
    title: compact(input.title, 120),
    excerpt: compact(input.excerpt),
    occurredAt: new Date(input.occurredAt).toISOString(),
    ...(memoryProvenance ? {
      memoryProvenance: {
        ...memoryProvenance,
        sourceLabel: compact(memoryProvenance.sourceLabel, 180),
        sourceOccurredAt: new Date(memoryProvenance.sourceOccurredAt).toISOString(),
      },
    } : {}),
  };
}

function joinParts(parts: Array<string | undefined>): string {
  return parts.filter((value): value is string => Boolean(value)).join(" · ");
}

const ignoredQuestionTerms = new Set([
  "about", "after", "again", "been", "before", "could", "does", "from", "have",
  "into", "life", "might", "should", "that", "their", "there", "these", "thing",
  "this", "what", "when", "where", "which", "with", "would", "your",
]);

function questionTerms(question: string): Set<string> {
  const terms = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(terms.filter((term) => term.length >= 4 && !ignoredQuestionTerms.has(term)));
}

function memorySelection(items: MemoryItem[], question: string): MemoryItem[] {
  const terms = questionTerms(question);
  return items
    .map((item) => {
      const searchable = joinParts([
        item.title,
        item.body,
        item.kind,
        item.relationship,
        item.relatedTitle,
        item.source.label,
      ]).toLowerCase();
      const overlap = [...terms].filter((term) => searchable.includes(term)).length;
      const sourceTime = Date.parse(item.source.occurredAt);
      return { item, overlap, sourceTime: Number.isFinite(sourceTime) ? sourceTime : 0 };
    })
    .sort((left, right) => (
      right.overlap - left.overlap
      || right.sourceTime - left.sourceTime
      || left.item.rootId.localeCompare(right.item.rootId)
    ))
    .slice(0, maxMemorySources)
    .map(({ item }) => item);
}

function rankSources(mode: AiInteractionMode, sources: AiContextSource[]): AiContextSource[] {
  const domains = domainOrder[mode];
  return [...sources]
    .sort((left, right) => {
      const domainDifference = domains.indexOf(left.domain) - domains.indexOf(right.domain);
      if (domainDifference !== 0) return domainDifference;
      const authorityDifference = authorityOrder[left.authorityClass] - authorityOrder[right.authorityClass];
      if (authorityDifference !== 0) return authorityDifference;
      const timeDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
      return timeDifference !== 0 ? timeDifference : left.sourceId.localeCompare(right.sourceId);
    })
    .slice(0, maxSources);
}

function validateAssistantResult(
  answer: string,
  citedSourceIds: string[],
  modelName: string,
  sources: AiContextSource[],
): void {
  if (!answer.trim() || answer.length > 6_000 || !modelName.trim() || modelName.length > 160) {
    throw new AiRetrievalError("AI_RESPONSE_INVALID");
  }
  const available = new Set(sources.map((source) => source.sourceId));
  const seen = new Set<string>();
  for (const sourceId of citedSourceIds) {
    if (!available.has(sourceId) || seen.has(sourceId)) {
      throw new AiRetrievalError("AI_RESPONSE_INVALID");
    }
    seen.add(sourceId);
  }
}

export async function askLifeOs(
  command: AskLifeOsCommand,
  principal: AuthenticatedUserPrincipal,
  dependencies: AskLifeOsDependencies,
): Promise<AskLifeOsResponse> {
  const userId = requiredUserId(principal.userId);
  const normalized = validatedCommand(command);
  const generatedAt = normalizedTimestamp(dependencies.clock.now());
  const localDates = previousLocalDates(normalized.localDate);
  const readContext = { principal: { actorType: "USER" as const, userId } };

  const [direction, calendar, notNow, drift, journey, memory, ...daily] = await Promise.all([
    getDirectionOverview(readContext, { reader: dependencies.directionReader }),
    getCanonicalCalendar(
      { from: normalized.calendarFrom, to: normalized.calendarTo },
      readContext,
      { reader: dependencies.calendarReader },
    ),
    getNotNowOverview(userId, dependencies.brainDumpNotNowReader),
    getDriftOverview(userId, dependencies.driftReader),
    getJourneyPracticeOverview(userId, dependencies.journeyPracticeReader),
    dependencies.memoryReader
      ? dependencies.memoryReader.getOverview(userId, {
          timeZone: normalized.timeZone,
          now: generatedAt,
        })
      : Promise.resolve(undefined),
    ...localDates.map((localDate) => getDailyReturnOverview(
      { principal: readContext.principal, localDate },
      { reader: dependencies.dailyReturnReader },
    )),
  ]);

  const sources: AiContextSource[] = [];

  if (direction.current) {
    sources.push(contextSource({
      sourceId: `direction:${direction.current.id}`,
      domain: "YOU",
      authorityClass: "DECISION",
      title: "Current direction",
      excerpt: direction.current.statement,
      occurredAt: direction.current.decidedAt,
    }));
  }

  for (const item of calendar.items.slice(0, 12)) {
    sources.push(contextSource({
      sourceId: `calendar:${item.id}`,
      domain: "CALENDAR",
      authorityClass: "FACT",
      title: item.title,
      excerpt: `${item.category} · ${item.commitment} · ${item.startsAt} to ${item.endsAt}`,
      occurredAt: item.startsAt,
    }));
  }

  const logEntries = daily.flatMap((overview) => overview.logEntries)
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 14);
  for (const entry of logEntries) {
    sources.push(contextSource({
      sourceId: `daily-log:${entry.id}`,
      domain: "REVIEWS",
      authorityClass: "REFLECTION",
      title: `Daily Log · ${entry.localDate}`,
      excerpt: entry.body,
      occurredAt: entry.occurredAt,
    }));
  }

  for (const overview of daily) {
    const review = overview.currentReview;
    if (!review) continue;
    sources.push(contextSource({
      sourceId: `daily-return:${review.id}`,
      domain: "REVIEWS",
      authorityClass: "REFLECTION",
      title: `Daily Return · ${review.localDate}`,
      excerpt: joinParts([
        optionalCompact(`What happened: ${review.whatHappened}`, 150),
        optionalCompact(`Moved: ${review.whatMovedForward}`, 120),
        optionalCompact(`Pulled away: ${review.whatPulledMeAway}`, 120),
        optionalCompact(`Return: ${review.returnToTomorrow}`, 120),
        review.returnState,
      ]),
      occurredAt: review.submittedAt,
    }));
  }

  for (const item of notNow.items.slice(0, 5)) {
    sources.push(contextSource({
      sourceId: `not-now:${item.id}:posture`,
      domain: "NOT_NOW",
      authorityClass: "DECISION",
      title: "Current NOT NOW posture",
      excerpt: joinParts([
        item.assessment,
        item.posture,
        item.state,
        optionalCompact(item.reviewNote, 220),
      ]),
      occurredAt: item.decidedAt,
    }));
    sources.push(contextSource({
      sourceId: `not-now:${item.id}:idea`,
      domain: "NOT_NOW",
      authorityClass: "USER_SOURCE",
      title: "Parked source idea",
      excerpt: item.rawText,
      occurredAt: item.decidedAt,
    }));
  }

  for (const item of drift.items.slice(0, 5)) {
    if (item.sourceNote) {
      sources.push(contextSource({
        sourceId: `drift:${item.driftId}:source`,
        domain: "DRIFT",
        authorityClass: "USER_SOURCE",
        title: "Drift source note",
        excerpt: item.sourceNote,
        occurredAt: item.occurredAt,
      }));
    }
    if (item.currentDecision) {
      const decision = item.currentDecision;
      sources.push(contextSource({
        sourceId: `drift:${item.driftId}:decision:${decision.decisionId}`,
        domain: "DRIFT",
        authorityClass: "DECISION",
        title: "Current drift understanding",
        excerpt: joinParts([
          decision.explanation,
          optionalCompact(decision.triggerNote, 140),
          optionalCompact(decision.emotionNote, 140),
          optionalCompact(decision.distractionNote, 140),
          decision.returnPosture,
          decision.lifecycleState,
        ]),
        occurredAt: decision.decidedAt,
      }));
    }
  }

  if (journey.activation) {
    sources.push(contextSource({
      sourceId: `journey:${journey.activation.decisionId}:activation`,
      domain: "JOURNEY",
      authorityClass: "DECISION",
      title: "Active Journey capability",
      excerpt: joinParts([
        journey.activation.journeyCode,
        journey.activation.capabilityCode,
        journey.activation.startingTechnique,
        optionalCompact(journey.activation.decisionReason, 240),
      ]),
      occurredAt: journey.activation.decidedAt,
    }));
  }

  if (journey.openSession) {
    const session = journey.openSession;
    sources.push(contextSource({
      sourceId: `journey-practice:${session.sessionId}:active`,
      domain: "JOURNEY",
      authorityClass: "FACT",
      title: "Active practice",
      excerpt: joinParts([session.technique, optionalCompact(session.experimentIntention, 320)]),
      occurredAt: session.startedAt,
    }));
  }

  for (const session of journey.completedSessions.slice(0, 5)) {
    const completion = session.completion!;
    sources.push(contextSource({
      sourceId: `journey-practice:${session.sessionId}:completed`,
      domain: "JOURNEY",
      authorityClass: "FACT",
      title: "Completed practice",
      excerpt: joinParts([
        session.technique,
        optionalCompact(session.experimentIntention, 280),
        `${completion.durationSeconds} seconds`,
      ]),
      occurredAt: completion.completedAt,
    }));
    if (completion.reflectionNote) {
      sources.push(contextSource({
        sourceId: `journey-practice:${session.sessionId}:reflection`,
        domain: "JOURNEY",
        authorityClass: "REFLECTION",
        title: "Practice reflection",
        excerpt: completion.reflectionNote,
        occurredAt: completion.completedAt,
      }));
    }
    if (completion.retainedLearningCandidate) {
      sources.push(contextSource({
        sourceId: `journey-practice:${session.sessionId}:learning-candidate`,
        domain: "JOURNEY",
        authorityClass: "REFLECTION",
        title: "Retained-learning candidate · not Memory",
        excerpt: completion.retainedLearningCandidate,
        occurredAt: completion.completedAt,
      }));
    }
  }

  for (const item of memorySelection(memory?.items ?? [], normalized.question)) {
    sources.push(contextSource({
      sourceId: `memory:${item.rootId}:revision:${item.revision}`,
      domain: "MEMORY",
      authorityClass: "REFLECTION",
      title: `Retained ${item.kind.toLowerCase().replaceAll("_", " ")} · ${item.title}`,
      excerpt: joinParts([
        item.body,
        `Relationship: ${item.relationship}`,
        item.relatedTitle ? `Related Memory: ${item.relatedTitle}` : undefined,
      ]),
      occurredAt: item.retainedAt,
      memoryProvenance: {
        rootId: item.rootId,
        itemId: item.itemId,
        revision: item.revision,
        kind: item.kind,
        relationship: item.relationship,
        ...(item.relatedRootId ? { relatedRootId: item.relatedRootId } : {}),
        sourceDomain: item.source.domain,
        sourceEntityId: item.source.entityId,
        sourceLabel: item.source.label,
        sourceOccurredAt: item.source.occurredAt,
      },
    }));
  }

  const ranked = rankSources(normalized.mode, sources);
  if (ranked.length === 0) throw new AiRetrievalError("CONTEXT_UNAVAILABLE");

  const result = await dependencies.assistant.answer({
    mode: normalized.mode,
    question: normalized.question,
    localDate: normalized.localDate,
    timeZone: normalized.timeZone,
    sources: ranked,
  });
  validateAssistantResult(result.answer, result.citedSourceIds, result.modelName, ranked);

  return {
    mode: normalized.mode,
    answer: result.answer.trim(),
    answerAuthority: "AI_OBSERVATION",
    citedSourceIds: result.citedSourceIds,
    sources: ranked,
    generatedAt,
    policyVersion,
    modelName: result.modelName.trim(),
  };
}
