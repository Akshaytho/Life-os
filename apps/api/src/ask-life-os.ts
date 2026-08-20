import {
  aiInteractionModes,
  type AiContextAuthorityClass,
  type AiContextDomain,
  type AiContextSource,
  type AiInteractionMode,
  type AskLifeOsCommand,
  type AskLifeOsResponse,
} from "../../../packages/contracts/ai-retrieval";
import type { BrainDumpNotNowReader } from "../../../packages/domain/brain-dump-not-now-read";
import type { CanonicalCalendarReader } from "../../../packages/domain/canonical-calendar-read";
import type { DailyReturnReader } from "../../../packages/domain/daily-return-read";
import type { DirectionDecisionReader } from "../../../packages/domain/direction-read";
import type { DriftReader } from "../../../packages/domain/drift-return-read";
import type { JourneyPracticeReader } from "../../../packages/domain/journey-practice-read";
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
  clock: AiRetrievalClock;
}

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const zonedTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const maxCalendarWindowMs = 14 * 24 * 60 * 60 * 1000;
const maxSources = 24;
const maxExcerptLength = 480;
const policyVersion = "ask-life-os-retrieval-v1" as const;

const domainOrder: Record<AiInteractionMode, readonly AiContextDomain[]> = {
  ASK: ["YOU", "JOURNEY", "CALENDAR", "REVIEWS", "DRIFT", "NOT_NOW"],
  REFLECT: ["REVIEWS", "JOURNEY", "DRIFT", "YOU", "CALENDAR", "NOT_NOW"],
  DECIDE: ["YOU", "CALENDAR", "JOURNEY", "NOT_NOW", "REVIEWS", "DRIFT"],
  REVIEW: ["REVIEWS", "CALENDAR", "JOURNEY", "DRIFT", "YOU", "NOT_NOW"],
  RESET: ["YOU", "DRIFT", "JOURNEY", "CALENDAR", "REVIEWS", "NOT_NOW"],
  PLAN: ["CALENDAR", "YOU", "JOURNEY", "REVIEWS", "NOT_NOW", "DRIFT"],
  CHALLENGE: ["YOU", "DRIFT", "NOT_NOW", "REVIEWS", "JOURNEY", "CALENDAR"],
};

const authorityOrder: Record<AiContextAuthorityClass, number> = {
  DECISION: 0,
  FACT: 1,
  REFLECTION: 2,
  USER_SOURCE: 3,
};

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
  return {
    ...input,
    title: compact(input.title, 120),
    excerpt: compact(input.excerpt),
    occurredAt: new Date(input.occurredAt).toISOString(),
  };
}

function joinParts(parts: Array<string | undefined>): string {
  return parts.filter((value): value is string => Boolean(value)).join(" · ");
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
  const localDates = previousLocalDates(normalized.localDate);
  const readContext = { principal: { actorType: "USER" as const, userId } };

  const [direction, calendar, notNow, drift, journey, ...daily] = await Promise.all([
    getDirectionOverview(readContext, { reader: dependencies.directionReader }),
    getCanonicalCalendar(
      { from: normalized.calendarFrom, to: normalized.calendarTo },
      readContext,
      { reader: dependencies.calendarReader },
    ),
    getNotNowOverview(userId, dependencies.brainDumpNotNowReader),
    getDriftOverview(userId, dependencies.driftReader),
    getJourneyPracticeOverview(userId, dependencies.journeyPracticeReader),
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
    generatedAt: normalizedTimestamp(dependencies.clock.now()),
    policyVersion,
    modelName: result.modelName.trim(),
  };
}
