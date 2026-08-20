import { createHash } from "node:crypto";
import type {
  ActivateJourneyCommand,
  ActivateJourneyReceipt,
} from "../../../packages/contracts/journey-practice";
import type {
  JourneyPracticeClock,
  JourneyPracticeIdGenerator,
  JourneyPracticeRequestContext,
  JourneyPracticeUnitOfWork,
} from "../../../packages/domain/journey-practice";
import {
  JourneyPracticeError,
  normalizedJourneyCapability,
  normalizedJourneyCode,
  normalizedJourneyInstant,
  normalizedJourneyNote,
  normalizedJourneyTechnique,
  requiredJourneyOpaqueId,
  requiredJourneyRequestId,
} from "./journey-practice-validation";

export interface ActivateJourneyDependencies {
  unitOfWork: JourneyPracticeUnitOfWork;
  clock: JourneyPracticeClock;
  ids: JourneyPracticeIdGenerator;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function activateJourney(
  command: ActivateJourneyCommand,
  context: JourneyPracticeRequestContext,
  dependencies: ActivateJourneyDependencies,
): Promise<ActivateJourneyReceipt> {
  const userId = requiredJourneyOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const journeyCode = normalizedJourneyCode(command.journeyCode);
  const capabilityCode = normalizedJourneyCapability(command.capabilityCode);
  const startingTechnique = normalizedJourneyTechnique(command.startingTechnique);
  const decisionReason = normalizedJourneyNote(command.decisionReason, 2000);
  const requestId = requiredJourneyRequestId(context.requestId, "journey_activate");
  const decidedAt = normalizedJourneyInstant(context.receivedAt);
  const requestFingerprint = fingerprint({
    journeyCode, capabilityCode, startingTechnique, decisionReason,
  });

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const replay = await transaction.findActivationByRequestId(requestId, userId);
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) {
        throw new JourneyPracticeError("IDEMPOTENCY_CONFLICT");
      }
      return {
        decisionId: replay.decisionId,
        journeyCode: replay.journeyCode,
        capabilityCode: replay.capabilityCode,
        startingTechnique: replay.startingTechnique,
        ...(replay.decisionReason ? { decisionReason: replay.decisionReason } : {}),
        authorityClass: "DECISION",
        decidedAt: replay.decidedAt,
        recordedAt: replay.recordedAt,
        idempotentReplay: true,
      };
    }
    if (await transaction.getCurrentActivation(userId)) {
      throw new JourneyPracticeError("JOURNEY_ALREADY_ACTIVATED");
    }
    const recordedAt = normalizedJourneyInstant(dependencies.clock.now());
    if (Date.parse(recordedAt) < Date.parse(decidedAt)) {
      throw new JourneyPracticeError("INVALID_DECISION");
    }
    const decisionId = requiredJourneyOpaqueId(
      dependencies.ids.next("journey-decision"),
      "INVALID_DECISION",
    );
    const eventId = requiredJourneyOpaqueId(dependencies.ids.next("event"), "INVALID_DECISION");
    await transaction.createActivation({
      decisionId, userId, journeyCode, capabilityCode, startingTechnique,
      ...(decisionReason ? { decisionReason } : {}),
      decidedAt, recordedAt, source: context.source, correlationId: requestId,
      requestId, requestFingerprint,
    });
    await transaction.appendDomainEvent({
      eventId, userId, occurredAt: decidedAt, recordedAt, actorType: "USER",
      actorId: userId, eventType: "JOURNEY_CAPABILITY_ACTIVATED",
      entityType: "journey_capability_decision", entityId: decisionId,
      source: context.source, correlationId: requestId,
      payloadJson: {
        journeyCode, capabilityCode, startingTechnique,
        authorityClass: "DECISION", hasDecisionReason: decisionReason !== undefined,
      },
      schemaVersion: 1,
    });
    return {
      decisionId, journeyCode, capabilityCode, startingTechnique,
      ...(decisionReason ? { decisionReason } : {}),
      authorityClass: "DECISION", decidedAt, recordedAt, idempotentReplay: false,
    };
  });
}
