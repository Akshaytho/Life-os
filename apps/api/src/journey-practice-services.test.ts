import assert from "node:assert/strict";
import test from "node:test";
import type {
  JourneyCapabilityDecisionRecord,
  JourneyPracticeCompletionRecord,
  JourneyPracticeDomainEventRecord,
  JourneyPracticeSessionRecord,
  JourneyPracticeTransaction,
  JourneyPracticeUnitOfWork,
} from "../../../packages/domain/journey-practice";
import type { JourneyPracticeReader } from "../../../packages/domain/journey-practice-read";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { activateJourney } from "./activate-journey";
import { completeJourneyPractice } from "./complete-journey-practice";
import { getJourneyPracticeOverview } from "./get-journey-practice-overview";
import { JourneyPracticeError } from "./journey-practice-validation";
import { startJourneyPractice } from "./start-journey-practice";
import { withWebWriteIdempotency, type WebWriteIdempotencyScope } from "./web-write-idempotency";

class MemoryJourneyStore implements JourneyPracticeTransaction, JourneyPracticeUnitOfWork, JourneyPracticeReader {
  activations: JourneyCapabilityDecisionRecord[] = [];
  sessions: JourneyPracticeSessionRecord[] = [];
  completions: JourneyPracticeCompletionRecord[] = [];
  events: JourneyPracticeDomainEventRecord[] = [];

  run<T>(_userId: string, work: (transaction: JourneyPracticeTransaction) => Promise<T>) {
    return work(this);
  }
  async findActivationByRequestId(requestId: string, userId: string) {
    return this.activations.find((item) => item.requestId === requestId && item.userId === userId);
  }
  async getCurrentActivation(userId: string) {
    return this.activations.find((item) => item.userId === userId);
  }
  async createActivation(record: JourneyCapabilityDecisionRecord) {
    this.activations.push(record);
  }
  async findSessionByRequestId(requestId: string, userId: string) {
    return this.sessions.find((item) => item.requestId === requestId && item.userId === userId);
  }
  async getOpenSession(userId: string) {
    return this.sessions.find((item) => (
      item.userId === userId
      && !this.completions.some((completion) => completion.sessionId === item.sessionId)
    ));
  }
  async getSession(sessionId: string, userId: string) {
    return this.sessions.find((item) => item.sessionId === sessionId && item.userId === userId);
  }
  async createSession(record: JourneyPracticeSessionRecord) {
    this.sessions.push(record);
  }
  async findCompletionByRequestId(requestId: string, userId: string) {
    return this.completions.find((item) => item.requestId === requestId && item.userId === userId);
  }
  async getCompletion(sessionId: string, userId: string) {
    return this.completions.find((item) => item.sessionId === sessionId && item.userId === userId);
  }
  async createCompletion(record: JourneyPracticeCompletionRecord) {
    this.completions.push(record);
  }
  async appendDomainEvent(event: JourneyPracticeDomainEventRecord) {
    this.events.push(event);
  }
  async getSnapshot(userId: string, limit: number) {
    const activation = this.activations.find((item) => item.userId === userId);
    return {
      ...(activation ? { activation } : {}),
      sessions: this.sessions
        .filter((item) => item.userId === userId)
        .slice(0, limit)
        .map((session) => {
          const completion = this.completions.find((item) => item.sessionId === session.sessionId);
          return { session, ...(completion ? { completion } : {}) };
        }),
    };
  }
}

function context(
  scope: WebWriteIdempotencyScope,
  key: string,
  receivedAt: string,
  userId = "user-a",
): WriteRequestContext {
  return withWebWriteIdempotency({
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt,
    requestId: "transport-request",
  }, scope, key);
}

function ids() {
  let value = 0;
  return { next: (prefix: string) => `${prefix}-unit-${++value}` };
}

test("explicit activation, start, completion and overview preserve authority without side effects", async () => {
  const store = new MemoryJourneyStore();
  const generator = ids();
  const activationContext = context(
    "JOURNEY_ACTIVATE",
    "journey-activation-unit-0001",
    "2026-08-18T10:00:00.000Z",
  );
  const activation = await activateJourney({
    journeyCode: "TRAVEL_CREATOR",
    capabilityCode: "SOUND_DESIGN",
    startingTechnique: "ENVIRONMENTAL_SOUND",
    decisionReason: "  My exact reason stays spaced.  ",
  }, activationContext, {
    unitOfWork: store,
    clock: { now: () => "2026-08-18T10:00:01.000Z" },
    ids: generator,
  });
  assert.equal(activation.authorityClass, "DECISION");
  assert.equal(activation.decisionReason, "  My exact reason stays spaced.  ");

  const replay = await activateJourney({
    journeyCode: "TRAVEL_CREATOR",
    capabilityCode: "SOUND_DESIGN",
    startingTechnique: "ENVIRONMENTAL_SOUND",
    decisionReason: "  My exact reason stays spaced.  ",
  }, activationContext, {
    unitOfWork: store,
    clock: { now: () => "2026-08-18T10:00:02.000Z" },
    ids: generator,
  });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(store.activations.length, 1);

  const start = await startJourneyPractice({
    technique: "J_L_CUTS",
    experimentIntention: "  Let sound arrive first.  ",
  }, context("JOURNEY_PRACTICE_START", "journey-practice-start-0001", "2026-08-18T10:05:00.000Z"), {
    unitOfWork: store,
    clock: { now: () => "2026-08-18T10:05:01.000Z" },
    ids: generator,
  });
  assert.equal(start.lifecycleState, "ACTIVE");
  assert.equal(store.sessions[0]?.experimentIntention, "  Let sound arrive first.  ");

  await assert.rejects(
    () => startJourneyPractice(
      { technique: "SILENCE" },
      context("JOURNEY_PRACTICE_START", "journey-practice-start-0002", "2026-08-18T10:06:00.000Z"),
      {
        unitOfWork: store,
        clock: { now: () => "2026-08-18T10:06:01.000Z" },
        ids: generator,
      },
    ),
    (error: unknown) =>
      error instanceof JourneyPracticeError
      && error.code === "OPEN_PRACTICE_SESSION_EXISTS",
  );

  const completionContext = context(
    "JOURNEY_PRACTICE_COMPLETE",
    "journey-practice-complete-0001",
    "2026-08-18T10:47:00.000Z",
  );
  const completion = await completeJourneyPractice(start.sessionId, {
    reflectionNote: "  The transition felt calmer.  ",
    retainedLearningCandidate: "  Room tone can carry continuity.  ",
  }, completionContext, {
    unitOfWork: store,
    clock: { now: () => "2026-08-18T10:47:01.000Z" },
    ids: generator,
  });
  assert.equal(completion.durationSeconds, 2520);
  assert.equal(completion.reflectionAuthorityClass, "REFLECTION");

  const completionReplay = await completeJourneyPractice(start.sessionId, {
    reflectionNote: "  The transition felt calmer.  ",
    retainedLearningCandidate: "  Room tone can carry continuity.  ",
  }, completionContext, {
    unitOfWork: store,
    clock: { now: () => "2026-08-18T10:48:00.000Z" },
    ids: generator,
  });
  assert.equal(completionReplay.idempotentReplay, true);
  assert.equal(store.completions.length, 1);

  const overview = await getJourneyPracticeOverview("user-a", store);
  assert.equal(overview.activation?.startingTechnique, "ENVIRONMENTAL_SOUND");
  assert.equal(overview.openSession, null);
  assert.equal(overview.completedSessions.length, 1);
  assert.equal(overview.practiceCounts.J_L_CUTS, 1);
  assert.equal(
    overview.completedSessions[0]?.completion?.retainedLearningCandidate,
    "  Room tone can carry continuity.  ",
  );

  const eventJson = JSON.stringify(store.events);
  for (const privateText of [
    "My exact reason",
    "Let sound arrive first",
    "transition felt calmer",
    "Room tone can carry continuity",
  ]) {
    assert.equal(eventJson.includes(privateText), false);
  }
  assert.deepEqual(store.events.map((event) => event.eventType), [
    "JOURNEY_CAPABILITY_ACTIVATED",
    "JOURNEY_PRACTICE_STARTED",
    "JOURNEY_PRACTICE_COMPLETED",
  ]);
});

test("activation is required, foreign sessions stay unavailable, and changed retries conflict", async () => {
  const store = new MemoryJourneyStore();
  const generator = ids();
  await assert.rejects(
    () => startJourneyPractice(
      { technique: "SILENCE" },
      context("JOURNEY_PRACTICE_START", "journey-practice-no-activation", "2026-08-18T11:00:00.000Z"),
      { unitOfWork: store, clock: { now: () => "2026-08-18T11:00:01.000Z" }, ids: generator },
    ),
    (error: unknown) =>
      error instanceof JourneyPracticeError
      && error.code === "JOURNEY_ACTIVATION_REQUIRED",
  );

  const activationContext = context(
    "JOURNEY_ACTIVATE",
    "journey-activation-conflict-0001",
    "2026-08-18T11:05:00.000Z",
  );
  await activateJourney({
    journeyCode: "TRAVEL_CREATOR",
    capabilityCode: "SOUND_DESIGN",
    startingTechnique: "SILENCE",
  }, activationContext, {
    unitOfWork: store,
    clock: { now: () => "2026-08-18T11:05:01.000Z" },
    ids: generator,
  });
  await assert.rejects(
    () => activateJourney({
      journeyCode: "TRAVEL_CREATOR",
      capabilityCode: "SOUND_DESIGN",
      startingTechnique: "LAYERING",
    }, activationContext, {
      unitOfWork: store,
      clock: { now: () => "2026-08-18T11:05:02.000Z" },
      ids: generator,
    }),
    (error: unknown) =>
      error instanceof JourneyPracticeError
      && error.code === "IDEMPOTENCY_CONFLICT",
  );

  await assert.rejects(
    () => completeJourneyPractice(
      "foreign-session",
      {},
      context(
        "JOURNEY_PRACTICE_COMPLETE",
        "journey-complete-foreign-0001",
        "2026-08-18T11:10:00.000Z",
        "user-b",
      ),
      { unitOfWork: store, clock: { now: () => "2026-08-18T11:10:01.000Z" }, ids: generator },
    ),
    (error: unknown) =>
      error instanceof JourneyPracticeError
      && error.code === "PRACTICE_SESSION_NOT_FOUND",
  );
});
