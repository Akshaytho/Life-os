import { createHash } from "node:crypto";
import type {
  DirectionDecisionReceipt,
  DirectionDecisionStatus,
  SetCurrentDirectionCommand,
} from "../../../packages/contracts/direction";
import type {
  DirectionDecisionClock,
  DirectionDecisionIdGenerator,
  DirectionDecisionRequestContext,
  DirectionDecisionUnitOfWork,
} from "../../../packages/domain/direction-decision";

export type DirectionDecisionErrorCode =
  | "APPROVAL_REQUIRED"
  | "INVALID_DIRECTION"
  | "CURRENT_DIRECTION_CHANGED"
  | "DIRECTION_UNCHANGED"
  | "IDEMPOTENCY_CONFLICT";

export class DirectionDecisionError extends Error {
  constructor(readonly code: DirectionDecisionErrorCode) {
    super(code);
    this.name = "DirectionDecisionError";
  }
}

export interface ActivateDirectionDecisionDependencies {
  unitOfWork: DirectionDecisionUnitOfWork;
  clock: DirectionDecisionClock;
  ids: DirectionDecisionIdGenerator;
}

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const maxDirectionLength = 1200;

function requiredOpaqueId(value: string, code: DirectionDecisionErrorCode): string {
  const normalized = value.trim();
  if (!opaqueIdPattern.test(normalized)) throw new DirectionDecisionError(code);
  return normalized;
}

function normalizedDirection(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxDirectionLength) {
    throw new DirectionDecisionError("INVALID_DIRECTION");
  }
  return normalized;
}

function expectedDirectionId(value: string | null): string | null {
  if (value === null) return null;
  return requiredOpaqueId(value, "INVALID_DIRECTION");
}

function validInstant(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new DirectionDecisionError("INVALID_DIRECTION");
  return new Date(milliseconds).toISOString();
}

function fingerprint(statement: string, expectedCurrentDirectionId: string | null): string {
  return createHash("sha256")
    .update(JSON.stringify({
      statement,
      expectedCurrentDirectionId,
      acknowledgement: "SET_AS_CURRENT_DIRECTION",
    }))
    .digest("hex");
}

function replayReceipt(
  existing: {
    directionId: string;
    status: DirectionDecisionStatus;
    decidedAt: string;
    supersedesDirectionId?: string;
    requestFingerprint: string;
  },
  expectedFingerprint: string,
): DirectionDecisionReceipt {
  if (existing.requestFingerprint !== expectedFingerprint) {
    throw new DirectionDecisionError("IDEMPOTENCY_CONFLICT");
  }
  return {
    directionId: existing.directionId,
    status: existing.status,
    authorityClass: "DECISION",
    decidedAt: existing.decidedAt,
    ...(existing.supersedesDirectionId ? { supersededDirectionId: existing.supersedesDirectionId } : {}),
    idempotentReplay: true,
  };
}

/**
 * High-authority Direction boundary. This service is intentionally not composed into
 * the hosted private runtime yet. The final statement is user-authored and the caller
 * must explicitly acknowledge that it will become the user's current Direction.
 */
export async function activateDirectionDecision(
  command: SetCurrentDirectionCommand,
  context: DirectionDecisionRequestContext,
  dependencies: ActivateDirectionDecisionDependencies,
): Promise<DirectionDecisionReceipt> {
  const userId = requiredOpaqueId(context.principal.userId, "INVALID_DIRECTION");
  const requestId = requiredOpaqueId(context.requestId, "INVALID_DIRECTION");
  const statement = normalizedDirection(command.statement);
  const expectedCurrentDirectionId = expectedDirectionId(command.expectedCurrentDirectionId);

  if (command.approval.explicit !== true || command.approval.acknowledgement !== "SET_AS_CURRENT_DIRECTION") {
    throw new DirectionDecisionError("APPROVAL_REQUIRED");
  }

  const decidedAt = validInstant(context.receivedAt);
  const requestFingerprint = fingerprint(statement, expectedCurrentDirectionId);

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const existing = await transaction.findByRequestId(requestId, userId);
    if (existing) return replayReceipt(existing, requestFingerprint);

    const current = await transaction.getActiveForUpdate(userId);
    const actualCurrentDirectionId = current?.directionId ?? null;
    if (actualCurrentDirectionId !== expectedCurrentDirectionId) {
      throw new DirectionDecisionError("CURRENT_DIRECTION_CHANGED");
    }
    if (current?.statement === statement) {
      throw new DirectionDecisionError("DIRECTION_UNCHANGED");
    }

    const recordedAt = validInstant(dependencies.clock.now());
    if (Date.parse(recordedAt) < Date.parse(decidedAt)) {
      throw new DirectionDecisionError("INVALID_DIRECTION");
    }

    const directionId = dependencies.ids.next("direction");
    const eventId = dependencies.ids.next("event");
    requiredOpaqueId(directionId, "INVALID_DIRECTION");
    requiredOpaqueId(eventId, "INVALID_DIRECTION");

    if (current) {
      await transaction.supersedeActive(current.directionId, userId, recordedAt);
    }

    await transaction.createDirection({
      directionId,
      userId,
      statement,
      status: "ACTIVE",
      decidedAt,
      recordedAt,
      ...(current ? { supersedesDirectionId: current.directionId } : {}),
      requestId,
      requestFingerprint,
    });

    await transaction.appendDomainEvent({
      eventId,
      userId,
      occurredAt: decidedAt,
      recordedAt,
      actorType: "USER",
      actorId: userId,
      eventType: "DIRECTION_DECISION_ACTIVATED",
      entityType: "direction_decision",
      entityId: directionId,
      source: context.source,
      correlationId: requestId,
      payloadJson: {
        authorityClass: "DECISION",
        statement,
        ...(current ? { supersededDirectionId: current.directionId } : {}),
      },
      schemaVersion: 1,
    });

    return {
      directionId,
      status: "ACTIVE",
      authorityClass: "DECISION",
      decidedAt,
      ...(current ? { supersededDirectionId: current.directionId } : {}),
      idempotentReplay: false,
    };
  });
}
