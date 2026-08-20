import { createHash } from "node:crypto";
import type {
  CompleteJourneyPracticeCommand,
  CompleteJourneyPracticeReceipt,
} from "../../../packages/contracts/journey-practice";
import type {
  JourneyPracticeClock,
  JourneyPracticeIdGenerator,
  JourneyPracticeRequestContext,
  JourneyPracticeUnitOfWork,
} from "../../../packages/domain/journey-practice";
import {
  JourneyPracticeError,
  normalizedJourneyInstant,
  normalizedJourneyNote,
  requiredJourneyOpaqueId,
  requiredJourneyRequestId,
} from "./journey-practice-validation";

export interface CompleteJourneyPracticeDependencies {
  unitOfWork: JourneyPracticeUnitOfWork;
  clock: JourneyPracticeClock;
  ids: JourneyPracticeIdGenerator;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function completeJourneyPractice(
  untrustedSessionId: string,
  command: CompleteJourneyPracticeCommand,
  context: JourneyPracticeRequestContext,
  dependencies: CompleteJourneyPracticeDependencies,
): Promise<CompleteJourneyPracticeReceipt> {
  const userId = requiredJourneyOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const sessionId = requiredJourneyOpaqueId(untrustedSessionId, "INVALID_SESSION");
  const reflectionNote = normalizedJourneyNote(command.reflectionNote);
  const retainedLearningCandidate = normalizedJourneyNote(command.retainedLearningCandidate);
  const requestId = requiredJourneyRequestId(context.requestId, "journey_practice_complete");
  const requestFingerprint = fingerprint({
    sessionId, reflectionNote, retainedLearningCandidate,
  });

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const replay = await transaction.findCompletionByRequestId(requestId, userId);
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint || replay.sessionId !== sessionId) {
        throw new JourneyPracticeError("IDEMPOTENCY_CONFLICT");
      }
      const replaySession = await transaction.getSession(sessionId, userId);
      if (!replaySession) throw new JourneyPracticeError("PRACTICE_SESSION_NOT_FOUND");
      return {
        sessionId, completionId: replay.completionId, lifecycleState: "COMPLETED",
        technique: replaySession.technique, authorityClass: "FACT",
        reflectionAuthorityClass: "REFLECTION", startedAt: replaySession.startedAt,
        completedAt: replay.completedAt, recordedAt: replay.recordedAt,
        durationSeconds: Math.max(0, Math.floor(
          (Date.parse(replay.completedAt) - Date.parse(replaySession.startedAt)) / 1000,
        )),
        idempotentReplay: true,
      };
    }
    const session = await transaction.getSession(sessionId, userId);
    if (!session) throw new JourneyPracticeError("PRACTICE_SESSION_NOT_FOUND");
    if (await transaction.getCompletion(sessionId, userId)) {
      throw new JourneyPracticeError("PRACTICE_SESSION_ALREADY_COMPLETED");
    }
    const activation = await transaction.getCurrentActivation(userId);
    if (!activation || activation.decisionId !== session.decisionId) {
      throw new JourneyPracticeError("JOURNEY_ACTIVATION_REQUIRED");
    }
    const completedAt = normalizedJourneyInstant(context.receivedAt);
    const recordedAt = normalizedJourneyInstant(dependencies.clock.now());
    if (
      Date.parse(completedAt) < Date.parse(session.startedAt)
      || Date.parse(recordedAt) < Date.parse(completedAt)
    ) throw new JourneyPracticeError("INVALID_DECISION");
    const durationSeconds = Math.floor(
      (Date.parse(completedAt) - Date.parse(session.startedAt)) / 1000,
    );
    const completionId = requiredJourneyOpaqueId(
      dependencies.ids.next("practice-completion"),
      "INVALID_DECISION",
    );
    const eventId = requiredJourneyOpaqueId(dependencies.ids.next("event"), "INVALID_DECISION");
    await transaction.createCompletion({
      completionId, sessionId, userId,
      ...(reflectionNote ? { reflectionNote } : {}),
      ...(retainedLearningCandidate ? { retainedLearningCandidate } : {}),
      completedAt, recordedAt, source: context.source, correlationId: requestId,
      requestId, requestFingerprint,
    });
    await transaction.appendDomainEvent({
      eventId, userId, occurredAt: completedAt, recordedAt, actorType: "USER",
      actorId: userId, eventType: "JOURNEY_PRACTICE_COMPLETED",
      entityType: "journey_practice_session", entityId: sessionId,
      source: context.source, correlationId: requestId,
      payloadJson: {
        completionId, decisionId: activation.decisionId,
        journeyCode: activation.journeyCode,
        capabilityCode: activation.capabilityCode,
        technique: session.technique, lifecycleState: "COMPLETED",
        authorityClass: "FACT", reflectionAuthorityClass: "REFLECTION",
        durationSeconds, hasReflection: reflectionNote !== undefined,
        hasRetainedLearningCandidate: retainedLearningCandidate !== undefined,
      },
      schemaVersion: 1,
    });
    return {
      sessionId, completionId, lifecycleState: "COMPLETED",
      technique: session.technique, authorityClass: "FACT",
      reflectionAuthorityClass: "REFLECTION", startedAt: session.startedAt,
      completedAt, recordedAt, durationSeconds, idempotentReplay: false,
    };
  });
}
