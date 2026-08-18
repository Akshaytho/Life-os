import { createHash } from "node:crypto";
import type {
  DriftDecisionReceipt,
  RecordDriftReturnCommand,
} from "../../../packages/contracts/drift-return";
import {
  lifecycleForReturnPosture,
  type DriftClock,
  type DriftDecisionRecord,
  type DriftIdGenerator,
  type DriftRequestContext,
  type DriftUnitOfWork,
} from "../../../packages/domain/drift-return";
import {
  DriftError,
  normalizedDriftExpectedRevision,
  normalizedDriftInstant,
  normalizedDriftReturnPosture,
  requiredDriftOpaqueId,
  requiredDriftRequestId,
} from "./drift-return-validation";

export interface RecordDriftReturnDependencies {
  unitOfWork: DriftUnitOfWork;
  clock: DriftClock;
  ids: DriftIdGenerator;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function recordDriftReturn(
  driftIdInput: string,
  command: RecordDriftReturnCommand,
  context: DriftRequestContext,
  dependencies: RecordDriftReturnDependencies,
): Promise<DriftDecisionReceipt> {
  const userId = requiredDriftOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const driftId = requiredDriftOpaqueId(driftIdInput, "INVALID_DRIFT");
  const returnPosture = normalizedDriftReturnPosture(command.returnPosture);
  const expectedCurrentRevision = normalizedDriftExpectedRevision(command.expectedCurrentRevision);
  const requestId = requiredDriftRequestId(context.requestId, "drift_return");
  const decidedAt = normalizedDriftInstant(context.receivedAt);
  const requestFingerprint = fingerprint({ driftId, returnPosture, expectedCurrentRevision });

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const occurrence = await transaction.getOccurrenceForUpdate(driftId, userId);
    if (!occurrence) throw new DriftError("DRIFT_NOT_FOUND");

    const replay = await transaction.findDecisionByRequestId(requestId, userId);
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) throw new DriftError("IDEMPOTENCY_CONFLICT");
      return receiptForDecision(replay, true);
    }

    const current = await transaction.getCurrentDecisionForUpdate(driftId, userId);
    if (!current) throw new DriftError("DRIFT_UNDERSTANDING_REQUIRED");
    if (current.lifecycleState === "RESOLVED") throw new DriftError("DRIFT_ALREADY_RESOLVED");
    if (current.revision !== expectedCurrentRevision) throw new DriftError("DRIFT_DECISION_CHANGED");
    if (current.returnPosture === returnPosture) throw new DriftError("DRIFT_DECISION_UNCHANGED");

    const recordedAt = normalizedDriftInstant(dependencies.clock.now());
    if (Date.parse(recordedAt) < Date.parse(decidedAt)) throw new DriftError("INVALID_DECISION");
    const decisionId = requiredDriftOpaqueId(dependencies.ids.next("drift-decision"), "INVALID_DECISION");
    const eventId = requiredDriftOpaqueId(dependencies.ids.next("event"), "INVALID_DECISION");
    const revision = current.revision + 1;
    const lifecycleState = lifecycleForReturnPosture(returnPosture);
    const decision: DriftDecisionRecord = {
      decisionId,
      rootDecisionId: current.rootDecisionId,
      revision,
      driftId,
      userId,
      explanation: current.explanation,
      ...(current.triggerNote ? { triggerNote: current.triggerNote } : {}),
      ...(current.emotionNote ? { emotionNote: current.emotionNote } : {}),
      ...(current.distractionNote ? { distractionNote: current.distractionNote } : {}),
      returnPosture,
      lifecycleState,
      status: "CURRENT",
      decidedAt,
      recordedAt,
      supersedesDecisionId: current.decisionId,
      requestId,
      requestFingerprint,
    };

    await transaction.supersedeCurrentDecision(current.decisionId, userId, recordedAt);
    await transaction.createDecision(decision);
    if (returnPosture === "STILL_RETURNING") {
      await transaction.appendDomainEvent({
        eventId,
        userId,
        occurredAt: decidedAt,
        recordedAt,
        actorType: "USER",
        actorId: userId,
        eventType: "DRIFT_RETURN_RECORDED",
        entityType: "drift_decision",
        entityId: decisionId,
        source: context.source,
        correlationId: requestId,
        payloadJson: {
          driftId,
          rootDecisionId: current.rootDecisionId,
          revision,
          explanation: current.explanation,
          returnPosture,
          lifecycleState: "STILL_RETURNING",
          authorityClass: "DECISION",
          supersededDecisionId: current.decisionId,
        },
        schemaVersion: 1,
      });
    } else {
      await transaction.appendDomainEvent({
        eventId,
        userId,
        occurredAt: decidedAt,
        recordedAt,
        actorType: "USER",
        actorId: userId,
        eventType: "DRIFT_RESOLVED",
        entityType: "drift_decision",
        entityId: decisionId,
        source: context.source,
        correlationId: requestId,
        payloadJson: {
          driftId,
          rootDecisionId: current.rootDecisionId,
          revision,
          explanation: current.explanation,
          returnPosture,
          lifecycleState: "RESOLVED",
          authorityClass: "DECISION",
          supersededDecisionId: current.decisionId,
        },
        schemaVersion: 1,
      });
    }

    return receiptForDecision(decision, false);
  });
}

function receiptForDecision(decision: DriftDecisionRecord, idempotentReplay: boolean): DriftDecisionReceipt {
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
