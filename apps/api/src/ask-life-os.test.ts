import assert from "node:assert/strict";
import test from "node:test";
import type { AskLifeOsCommand } from "../../../packages/contracts/ai-retrieval";
import type { BrainDumpNotNowReader } from "../../../packages/domain/brain-dump-not-now-read";
import type { CanonicalCalendarReader } from "../../../packages/domain/canonical-calendar-read";
import type { DailyReturnReader } from "../../../packages/domain/daily-return-read";
import type { DirectionDecisionReader } from "../../../packages/domain/direction-read";
import type { DriftReader } from "../../../packages/domain/drift-return-read";
import type { JourneyPracticeReader } from "../../../packages/domain/journey-practice-read";
import type { MemoryReader } from "../../../packages/domain/memory-read";
import type {
  LifeOsAssistant,
  LifeOsAssistantInput,
  LifeOsAssistantResult,
} from "../../../packages/intelligence/life-os-assistant";
import { AiRetrievalError, askLifeOs, type AskLifeOsDependencies } from "./ask-life-os";

class FixtureAssistant implements LifeOsAssistant {
  inputs: LifeOsAssistantInput[] = [];
  result?: LifeOsAssistantResult;

  async answer(input: LifeOsAssistantInput): Promise<LifeOsAssistantResult> {
    this.inputs.push(input);
    return this.result ?? {
      answer: "Return to the active direction while respecting the fixed work commitment.",
      citedSourceIds: input.sources.slice(0, 2).map((source) => source.sourceId),
      modelName: "fixture-model",
    };
  }
}

function command(overrides: Partial<AskLifeOsCommand> = {}): AskLifeOsCommand {
  return {
    mode: "RESET",
    question: "What can I return to?",
    localDate: "2026-08-19",
    timeZone: "Asia/Kolkata",
    calendarFrom: "2026-08-19T00:00:00.000Z",
    calendarTo: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

function dependencies(assistant = new FixtureAssistant()): AskLifeOsDependencies {
  const directionReader: DirectionDecisionReader = {
    async listForUser(userId) {
      return [{
        directionId: "direction-active",
        userId,
        statement: "Build a stable financial and creative foundation for long-term travel.",
        status: "ACTIVE",
        decidedAt: "2026-08-12T09:00:00.000Z",
        endedAt: null,
      }];
    },
  };
  const calendarReader: CanonicalCalendarReader = {
    async listOverlapping(userId) {
      return [{
        id: "calendar-work",
        userId,
        title: "Software work",
        startsAt: "2026-08-19T04:30:00.000Z",
        endsAt: "2026-08-19T12:30:00.000Z",
        category: "Work",
        commitment: "Fixed",
        createdAt: "2026-08-18T10:00:00.000Z",
        sourceProposalId: "proposal-work",
      }];
    },
  };
  const dailyReturnReader: DailyReturnReader = {
    async listLogEntriesForDate(userId, localDate) {
      return localDate === "2026-08-19" ? [{
        entryId: "daily-log-current",
        userId,
        localDate,
        timeZone: "Asia/Kolkata",
        body: "I kept returning to the sound exercise between work blocks.",
        occurredAt: "2026-08-19T10:00:00.000Z",
        recordedAt: "2026-08-19T10:00:01.000Z",
      }] : [];
    },
    async listReviewsForDate(userId, localDate) {
      return localDate === "2026-08-18" ? [{
        reviewId: "daily-review-recent",
        userId,
        localDate,
        timeZone: "Asia/Kolkata",
        whatHappened: "Work took most of the day.",
        whatMovedForward: "I recorded room tone.",
        whatPulledMeAway: "Comparison.",
        returnToTomorrow: "One small J/L cut experiment.",
        returnState: "RETURNED",
        status: "CURRENT",
        submittedAt: "2026-08-18T18:00:00.000Z",
        recordedAt: "2026-08-18T18:00:01.000Z",
        endedAt: null,
      }] : [];
    },
  };
  const brainDumpNotNowReader: BrainDumpNotNowReader = {
    async listBrainDumpItems() { return []; },
    async listNotNowItems(userId) {
      return [{
        itemId: "not-now-trip",
        rootId: "not-now-trip-root",
        revision: 1,
        captureId: "capture-trip",
        userId,
        rawText: "Maybe switch everything to travel planning this month.",
        source: "WEB_APP",
        assessment: "TEMPORARY_INSPIRATION",
        posture: "PARK_IT",
        state: "PARKED_NOT_NOW",
        reviewNote: null,
        decidedAt: "2026-08-18T12:00:00.000Z",
        recordedAt: "2026-08-18T12:00:01.000Z",
      }];
    },
  };
  const driftReader: DriftReader = {
    async listCurrent(userId) {
      return [{
        occurrence: {
          driftId: "drift-current",
          userId,
          sourceNote: "A new creator path suddenly feels urgent.",
          source: "WEB_APP",
          correlationId: "drift-current",
          requestId: "drift-request",
          requestFingerprint: "a".repeat(64),
          occurredAt: "2026-08-19T09:00:00.000Z",
          recordedAt: "2026-08-19T09:00:01.000Z",
        },
        decisions: [{
          decisionId: "drift-decision-current",
          rootDecisionId: "drift-decision-current",
          revision: 1,
          driftId: "drift-current",
          userId,
          explanation: "TEMPORARY_INSPIRATION",
          returnPosture: "RETURN_TO_DIRECTION",
          lifecycleState: "RESOLVED",
          status: "CURRENT",
          decidedAt: "2026-08-19T09:05:00.000Z",
          recordedAt: "2026-08-19T09:05:01.000Z",
          requestId: "drift-decision-request",
          requestFingerprint: "b".repeat(64),
        }],
      }];
    },
  };
  const journeyPracticeReader: JourneyPracticeReader = {
    async getSnapshot(userId) {
      return {
        activation: {
          decisionId: "journey-active",
          userId,
          journeyCode: "TRAVEL_CREATOR",
          capabilityCode: "SOUND_DESIGN",
          startingTechnique: "ENVIRONMENTAL_SOUND",
          source: "WEB_APP",
          correlationId: "journey-active",
          requestId: "journey-request",
          requestFingerprint: "c".repeat(64),
          decidedAt: "2026-08-12T09:00:00.000Z",
          recordedAt: "2026-08-12T09:00:01.000Z",
        },
        sessions: [],
      };
    },
  };
  const memoryReader: MemoryReader = {
    async getOverview() {
      return {
        trustedNow: [],
        candidates: [{
          candidateId: "JOURNEY_PRACTICE:candidate-not-retained",
          domain: "JOURNEY_PRACTICE",
          entityId: "candidate-not-retained",
          label: "Unretained candidate",
          occurredAt: "2026-08-19T11:00:00.000Z",
          authorityClass: "REFLECTION",
          suggestedTitle: "Must never enter Ask",
          body: "Candidate content must remain outside provider context.",
        }],
        items: [{
          itemId: "memory-room-tone-v2",
          rootId: "memory-room-tone",
          revision: 2,
          kind: "LEARNING",
          title: "Room tone reveals layering choices",
          body: "A short room tone comparison makes environmental layers easier to hear.",
          authorityClass: "REFLECTION",
          relationship: "REINFORCES",
          relatedRootId: "memory-small-return",
          relatedTitle: "Return can stay small",
          status: "CURRENT",
          retainedAt: "2026-08-18T18:30:00.000Z",
          recordedAt: "2026-08-18T18:30:01.000Z",
          source: {
            domain: "JOURNEY_PRACTICE",
            entityId: "practice-completion-room-tone",
            label: "Journey practice · Environmental sound",
            occurredAt: "2026-08-18T17:45:00.000Z",
            authorityClass: "REFLECTION",
          },
          history: [{
            itemId: "memory-room-tone-v1",
            revision: 1,
            kind: "LEARNING",
            title: "Superseded title must not enter Ask",
            body: "Superseded body must not enter Ask.",
            authorityClass: "REFLECTION",
            relationship: "NEW",
            status: "SUPERSEDED",
            retainedAt: "2026-08-17T18:30:00.000Z",
            recordedAt: "2026-08-17T18:30:01.000Z",
            endedAt: "2026-08-18T18:30:00.000Z",
          }],
        }],
        timeCompression: { month: null, weeks: [] },
        patterns: [],
      };
    },
  };
  return {
    assistant,
    directionReader,
    calendarReader,
    dailyReturnReader,
    brainDumpNotNowReader,
    driftReader,
    journeyPracticeReader,
    memoryReader,
    clock: { now: () => "2026-08-19T12:00:00.000Z" },
  };
}

test("Ask Life OS assembles mode-ranked typed context and returns source-visible AI observation", async () => {
  const assistant = new FixtureAssistant();
  const result = await askLifeOs(
    command(),
    { actorType: "USER", userId: "user-a" },
    dependencies(assistant),
  );

  assert.equal(assistant.inputs.length, 1);
  assert.equal(assistant.inputs[0]?.mode, "RESET");
  assert.deepEqual(
    assistant.inputs[0]?.sources.slice(0, 4).map((source) => [source.domain, source.authorityClass]),
    [["YOU", "DECISION"], ["DRIFT", "DECISION"], ["DRIFT", "USER_SOURCE"], ["JOURNEY", "DECISION"]],
  );
  assert.equal(result.answerAuthority, "AI_OBSERVATION");
  assert.equal(result.policyVersion, "ask-life-os-retrieval-v1.1");
  assert.equal(result.modelName, "fixture-model");
  assert.ok(result.sources.length <= 24);
  assert.deepEqual(result.citedSourceIds, result.sources.slice(0, 2).map((source) => source.sourceId));
  const memory = result.sources.find((source) => source.domain === "MEMORY");
  assert.equal(memory?.authorityClass, "REFLECTION");
  assert.equal(memory?.memoryProvenance?.revision, 2);
  assert.equal(JSON.stringify(assistant.inputs[0]).includes("Candidate content"), false);
  assert.equal(JSON.stringify(assistant.inputs[0]).includes("Superseded body"), false);
});

test("mode changes context priority without changing source authority", async () => {
  const assistant = new FixtureAssistant();
  await askLifeOs(
    command({ mode: "PLAN" }),
    { actorType: "USER", userId: "user-a" },
    dependencies(assistant),
  );
  assert.equal(assistant.inputs[0]?.sources[0]?.domain, "CALENDAR");
  assert.equal(assistant.inputs[0]?.sources[0]?.authorityClass, "FACT");
});

test("Ask selects at most six current Memory items by deterministic word overlap without candidates or history", async () => {
  const assistant = new FixtureAssistant();
  const value = dependencies(assistant);
  value.memoryReader = {
    async getOverview() {
      const items = Array.from({ length: 8 }, (_, index) => ({
        itemId: `memory-item-${index}`,
        rootId: `memory-root-${index}`,
        revision: 1,
        kind: "LEARNING" as const,
        title: index === 7 ? "Room tone lesson" : `Unrelated retained note ${index}`,
        body: index === 7 ? "Environmental sound layering became easier to hear." : "Different retained context.",
        authorityClass: "REFLECTION" as const,
        relationship: "NEW" as const,
        status: "CURRENT" as const,
        retainedAt: `2026-08-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`,
        recordedAt: `2026-08-${String(10 + index).padStart(2, "0")}T12:00:01.000Z`,
        source: {
          domain: "JOURNEY_PRACTICE" as const,
          entityId: `completion-${index}`,
          label: "Journey practice · Environmental sound",
          occurredAt: `2026-08-${String(10 + index).padStart(2, "0")}T11:00:00.000Z`,
          authorityClass: "REFLECTION" as const,
        },
        history: index === 7 ? [{
          itemId: "memory-item-7-old",
          revision: 0,
          kind: "LEARNING" as const,
          title: "History marker",
          body: "History must stay outside Ask.",
          authorityClass: "REFLECTION" as const,
          relationship: "NEW" as const,
          status: "SUPERSEDED" as const,
          retainedAt: "2026-08-09T12:00:00.000Z",
          recordedAt: "2026-08-09T12:00:01.000Z",
          endedAt: "2026-08-17T12:00:00.000Z",
        }] : [],
      }));
      return {
        trustedNow: [],
        candidates: [{
          candidateId: "candidate-hidden",
          domain: "PERIODIC_REVIEW" as const,
          entityId: "candidate-hidden",
          label: "Candidate marker",
          occurredAt: "2026-08-19T11:00:00.000Z",
          authorityClass: "REFLECTION" as const,
          suggestedTitle: "Candidate marker",
          body: "Candidate must stay outside Ask.",
        }],
        items,
        timeCompression: { month: null, weeks: [] },
        patterns: [],
      };
    },
  };

  const result = await askLifeOs(
    command({ mode: "ASK", question: "What did I learn about room tone layering?" }),
    { actorType: "USER", userId: "user-a" },
    value,
  );
  const memories = result.sources.filter((source) => source.domain === "MEMORY");
  assert.equal(memories.length, 6);
  assert.ok(memories.some((source) => source.sourceId === "memory:memory-root-7:revision:1"));
  assert.equal(JSON.stringify(assistant.inputs[0]).includes("Candidate must"), false);
  assert.equal(JSON.stringify(assistant.inputs[0]).includes("History must"), false);
  assert.equal(JSON.stringify(memories).includes("overlap"), false);
});

test("unknown or duplicate model citations fail closed", async () => {
  for (const citedSourceIds of [["invented"], ["direction:direction-active", "direction:direction-active"]]) {
    const assistant = new FixtureAssistant();
    assistant.result = { answer: "Unsafe answer", citedSourceIds, modelName: "fixture-model" };
    await assert.rejects(
      askLifeOs(command(), { actorType: "USER", userId: "user-a" }, dependencies(assistant)),
      (error: unknown) => error instanceof AiRetrievalError && error.code === "AI_RESPONSE_INVALID",
    );
  }
});

test("empty canonical context returns no invented answer", async () => {
  const assistant = new FixtureAssistant();
  const empty = dependencies(assistant);
  empty.directionReader = { async listForUser() { return []; } };
  empty.calendarReader = { async listOverlapping() { return []; } };
  empty.dailyReturnReader = {
    async listLogEntriesForDate() { return []; },
    async listReviewsForDate() { return []; },
  };
  empty.brainDumpNotNowReader = {
    async listBrainDumpItems() { return []; },
    async listNotNowItems() { return []; },
  };
  empty.driftReader = { async listCurrent() { return []; } };
  empty.journeyPracticeReader = { async getSnapshot() { return { sessions: [] }; } };
  empty.memoryReader = undefined;

  await assert.rejects(
    askLifeOs(command(), { actorType: "USER", userId: "user-a" }, empty),
    (error: unknown) => error instanceof AiRetrievalError && error.code === "CONTEXT_UNAVAILABLE",
  );
  assert.equal(assistant.inputs.length, 0);
});

test("invalid questions, dates, zones, and oversized windows are rejected before reads", async () => {
  const invalid: AskLifeOsCommand[] = [
    command({ question: " " }),
    command({ localDate: "2026-02-30" }),
    command({ timeZone: "Mars/Olympus" }),
    command({ calendarTo: "2026-09-19T00:00:00.000Z" }),
  ];
  for (const item of invalid) {
    await assert.rejects(
      askLifeOs(item, { actorType: "USER", userId: "user-a" }, dependencies()),
      (error: unknown) => error instanceof AiRetrievalError && error.code === "INVALID_REQUEST",
    );
  }
});

test("a poisoned cross-user reader result is rejected before provider access", async () => {
  const assistant = new FixtureAssistant();
  const poisoned = dependencies(assistant);
  poisoned.directionReader = {
    async listForUser() {
      return [{
        directionId: "other-direction",
        userId: "user-b",
        statement: "Other user's direction",
        status: "ACTIVE",
        decidedAt: "2026-08-12T09:00:00.000Z",
        endedAt: null,
      }];
    },
  };
  await assert.rejects(
    askLifeOs(command(), { actorType: "USER", userId: "user-a" }, poisoned),
  );
  assert.equal(assistant.inputs.length, 0);
});
