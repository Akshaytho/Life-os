import { createHash } from "node:crypto";
import type {
  ConfirmDriftUnderstandingCommand,
  DriftDecisionReceipt,
} from "../../../packages/contracts/drift-return";
import type {
  DriftClock,
  DriftDecisionRecord,
  DriftIdGenerator,
  DriftRequestContext,
  DriftUnitOfWork,
} from "../../../packages/domain/drift-return";
import {
  DriftError,
  normalizedDriftExplanation,
  normalizedDriftInstant,
  normalizedDriftReflectionNote,
  requiredDriftOpaqueId,
  requiredDriftRequestId,
} from "./drift-return-validation";

export interface ConfirmDriftUnderstandingDependencies {
  unitOfWork: DriftUnitOfWork;
  clock: DriftClock;
  ids: DriftIdGenerator;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function confirmDriftUnderstanding(
  driftIdInput: string,
  command: ConfirmDriftUnderstandingCommand,
  context: DriftRequestContext,
  dependencies: ConfirmDriftUnderstandingDependencies,
): Promise<DriftDecisionReceipt> {
  const userId = requiredDriftOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const driftId = requiredDriftOpaqueId(driftIdInput, "INVALID_DRIFT");
  const explanation = normalizedDriftExplanation(command.explanation);
  const triggerNote = normalizedDriftReflectionNote(command.triggerNote);
  const emotionNote = normalizedDriftReflectionNote(command.emotionNote);
  const distractionNote = normalizedDriftReflectionNote(command.distractionNote);
  const expectedCurrentDecisionId = command.expectedCurrentDecisionId === null
    ? null
    : requiredDriftOpaqueId(command.expectedCurrentDecisionId, "INVALID_DECISION");
  const requestId = requiredDriftRequestId(context.requestId, "drift_understand");
  const decidedAt = normalizedDriftInstant(context.receivedAt);
  const requestFingerprint = fingerprint({
    driftId,
    explanation,
    triggerNote,
    emotionNote,
    distractionNote,
    expectedCurrentDecisionId,
  });

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const occurrence = await transaction.getOccurrenceForUpdate(driftId, userId);
    if (!occurrence) throw new DriftError("DRIFT_NOT_FOUND");

    const replay = await transaction.findDecisionByRequestId(requestId, userId);
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) throw new DriftError("IDEMPOTENCY_CONFLICT");
      return receiptForDecision(replay, true);
    }

    const current = await transaction.getCurrentDecisionForUpdate(driftId, userId);
    if ((current?.decisionId ?? null) !== expectedCurrentDecisionId) {
      throw new DriftError("DRIFT_DECISION_CHANGED");
    }
    if (current?.lifecycleState === "RESOLVED") throw new DriftError("DRIFT_ALREADY_RESOLVED");
    if (current
      && current.explanation === explanation
      && current.triggerNote === triggerNote
      && current.emotionNote === emotionNote
      && current.distractionNote === distractionNote) {
      throw new DriftError("DRIFT_DECISION_UNCHANGED");
    }

    const recordedAt = normalizedDriftInstant(dependencies.clock.now());
    if (Date.parse(recordedAt) < Date.parse(decidedAt)) throw new DriftError("INVALID_DECISION");
    const decisionId = requiredDriftOpaqueId(dependencies.ids.next("drift-decision"), "INVALID_DECISION");
    const eventId = requiredDriftOpaqueId(dependencies.ids.next("event"), "INVALID_DECISION");
    const rootDecisionId = current?.rootDecisionId ?? decisionId;
    const revision = (current?.revision ?? 0) + 1;
    const preserveReturning = current?.lifecycleState === "STILL_RETURNING";
    const lifecycleState = preserveReturning ? "STILL_RETURNING" as const : "UNDERSTOOD" as const;

    if (current) await transaction.supersedeCurrentDecision(current.decisionId, userId, recordedAt);
    const decision = {
      decisionId,
      rootDecisionId,
      revision,
      driftId,
      userId,
      explanation,
      ...(triggerNote ? { triggerNote } : {}),
      ...(emotionNote ? { emotionNote } : {}),
      ...(distractionNote ? { distractionNote } : {}),
      ...(preserveReturning ? { returnPosture: "STILL_RETURNING" as const } : {}),
      lifecycleState,
      status: "CURRENT" as const,
      decidedAt,
      recordedAt,
      ...(current ? { supersedesDecisionId: current.decisionId } : {}),
      requestId,
      requestFingerprint,
    };
    await transaction.createDecision(decision);
    await transaction.appendDomainEvent({
      eventId,
      userId,
      occurredAt: decidedAt,
      recordedAt,
      actorType: "USER",
      actorId: userId,
      eventType: "DRIFT_UNDERSTANDING_CONFIRMED",
      entityType: "drift_decision",
      entityId: decisionId,
      source: context.source,
      correlationId: requestId,
      payloadJson: {
        driftId,
        rootDecisionId,
        revision,
        explanation,
        lifecycleState,
        ...(preserveReturning ? { returnPosture: "STILL_RETURNING" as const } : {}),
        authorityClass: "DECISION",
        ...(current ? { supersededDecisionId: current.decisionId } : {}),
      },
      schemaVersion: 1,
    });

    return receiptForDecision(decision, false);
  });
}

function receiptForDecision(
  decision: DriftDecisionRecord,
  idempotentReplay: boolean,
): DriftDecisionReceipt {
  return {
    decisionId: decision.decisionId,
    rootDecisionId: decision.rootDecisionId,
    driftId: decision.driftId,
    revision: decision.revision,
    explanation: decision.explanation,
    ...(decision.returnPosture ? { returnPosture: decision.returnPosture } : {}),
    lifecycleState: decision.lifecycleState,
    status: "CURRENT",
    authorityClass: "DECISION",
    decidedAt: decision.decidedAt,
    recordedAt: decision.recordedAt,
    ...(decision.supersedesDecisionId ? { supersededDecisionId: decision.supersedesDecisionId } : {}),
    idempotentReplay,
  };
}
