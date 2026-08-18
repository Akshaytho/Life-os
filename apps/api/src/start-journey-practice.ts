import { createHash } from "node:crypto";
import type {
  StartJourneyPracticeCommand,
  StartJourneyPracticeReceipt,
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
  normalizedJourneyTechnique,
  requiredJourneyOpaqueId,
  requiredJourneyRequestId,
} from "./journey-practice-validation";

export interface StartJourneyPracticeDependencies {
  unitOfWork: JourneyPracticeUnitOfWork;
  clock: JourneyPracticeClock;
  ids: JourneyPracticeIdGenerator;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function startJourneyPractice(
  command: StartJourneyPracticeCommand,
  context: JourneyPracticeRequestContext,
  dependencies: StartJourneyPracticeDependencies,
): Promise<StartJourneyPracticeReceipt> {
  const userId = requiredJourneyOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const technique = normalizedJourneyTechnique(command.technique);
  const experimentIntention = normalizedJourneyNote(command.experimentIntention);
  const requestId = requiredJourneyRequestId(context.requestId, "journey_practice_start");
  const startedAt = normalizedJourneyInstant(context.receivedAt);
  const requestFingerprint = fingerprint({ technique, experimentIntention });

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const replay = await transaction.findSessionByRequestId(requestId, userId);
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) {
        throw new JourneyPracticeError("IDEMPOTENCY_CONFLICT");
      }
      return {
        sessionId: replay.sessionId, lifecycleState: "ACTIVE",
        technique: replay.technique, authorityClass: "FACT",
        startedAt: replay.startedAt, recordedAt: replay.recordedAt,
        idempotentReplay: true,
      };
    }
    const activation = await transaction.getCurrentActivation(userId);
    if (!activation) throw new JourneyPracticeError("JOURNEY_ACTIVATION_REQUIRED");
    if (await transaction.getOpenSession(userId)) {
      throw new JourneyPracticeError("OPEN_PRACTICE_SESSION_EXISTS");
    }
    const recordedAt = normalizedJourneyInstant(dependencies.clock.now());
    if (Date.parse(recordedAt) < Date.parse(startedAt)) {
      throw new JourneyPracticeError("INVALID_DECISION");
    }
    const sessionId = requiredJourneyOpaqueId(
      dependencies.ids.next("practice-session"),
      "INVALID_SESSION",
    );
    const eventId = requiredJourneyOpaqueId(dependencies.ids.next("event"), "INVALID_DECISION");
    await transaction.createSession({
      sessionId, userId, decisionId: activation.decisionId, technique,
      ...(experimentIntention ? { experimentIntention } : {}),
      startedAt, recordedAt, source: context.source, correlationId: requestId,
      requestId, requestFingerprint,
    });
    await transaction.appendDomainEvent({
      eventId, userId, occurredAt: startedAt, recordedAt, actorType: "USER",
      actorId: userId, eventType: "JOURNEY_PRACTICE_STARTED",
      entityType: "journey_practice_session", entityId: sessionId,
      source: context.source, correlationId: requestId,
      payloadJson: {
        decisionId: activation.decisionId,
        journeyCode: activation.journeyCode,
        capabilityCode: activation.capabilityCode,
        technique, lifecycleState: "ACTIVE", authorityClass: "FACT",
        hasExperimentIntention: experimentIntention !== undefined,
      },
      schemaVersion: 1,
    });
    return {
      sessionId, lifecycleState: "ACTIVE", technique, authorityClass: "FACT",
      startedAt, recordedAt, idempotentReplay: false,
    };
  });
}
