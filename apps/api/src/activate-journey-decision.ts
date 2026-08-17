import { createHash } from "node:crypto";
import type {
  ActivateJourneyCommand,
  JourneyDecisionReceipt,
  JourneyDecisionStatus,
} from "../../../packages/contracts/journey";
import type {
  JourneyDecisionClock,
  JourneyDecisionIdGenerator,
  JourneyDecisionRequestContext,
  JourneyDecisionUnitOfWork,
} from "../../../packages/domain/journey-decision";

export type JourneyDecisionErrorCode =
  | "APPROVAL_REQUIRED"
  | "INVALID_JOURNEY"
  | "IDEMPOTENCY_REQUIRED"
  | "CURRENT_JOURNEY_CHANGED"
  | "JOURNEY_UNCHANGED"
  | "IDEMPOTENCY_CONFLICT";

export class JourneyDecisionError extends Error {
  constructor(readonly code: JourneyDecisionErrorCode) {
    super(code);
    this.name = "JourneyDecisionError";
  }
}

export interface ActivateJourneyDecisionDependencies {
  unitOfWork: JourneyDecisionUnitOfWork;
  clock: JourneyDecisionClock;
  ids: JourneyDecisionIdGenerator;
}

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const journeyIdempotencyPrefix = "web-idem-v1:journey_activate:";
const maxJourneyFieldLength = 240;

function requiredOpaqueId(value: string, code: JourneyDecisionErrorCode): string {
  const normalized = value.trim();
  if (!opaqueIdPattern.test(normalized)) throw new JourneyDecisionError(code);
  return normalized;
}

function requiredJourneyRequestId(value: string): string {
  const normalized = requiredOpaqueId(value, "IDEMPOTENCY_REQUIRED");
  if (!normalized.startsWith(journeyIdempotencyPrefix)) {
    throw new JourneyDecisionError("IDEMPOTENCY_REQUIRED");
  }
  const digest = normalized.slice(journeyIdempotencyPrefix.length);
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new JourneyDecisionError("IDEMPOTENCY_REQUIRED");
  }
  return normalized;
}

function normalizedField(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxJourneyFieldLength) {
    throw new JourneyDecisionError("INVALID_JOURNEY");
  }
  return normalized;
}

function expectedJourneyId(value: string | null): string | null {
  if (value === null) return null;
  return requiredOpaqueId(value, "INVALID_JOURNEY");
}

function validInstant(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new JourneyDecisionError("INVALID_JOURNEY");
  return new Date(milliseconds).toISOString();
}

function fingerprint(
  name: string,
  activeCapability: string,
  expectedCurrentJourneyId: string | null,
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      name,
      activeCapability,
      expectedCurrentJourneyId,
      acknowledgement: "ACTIVATE_JOURNEY",
    }))
    .digest("hex");
}

function replayReceipt(
  existing: {
    journeyId: string;
    status: JourneyDecisionStatus;
    decidedAt: string;
    supersedesJourneyId?: string;
    requestFingerprint: string;
  },
  expectedFingerprint: string,
): JourneyDecisionReceipt {
  if (existing.requestFingerprint !== expectedFingerprint) {
    throw new JourneyDecisionError("IDEMPOTENCY_CONFLICT");
  }
  return {
    journeyId: existing.journeyId,
    status: existing.status,
    authorityClass: "DECISION",
    decidedAt: existing.decidedAt,
    ...(existing.supersedesJourneyId ? { supersededJourneyId: existing.supersedesJourneyId } : {}),
    idempotentReplay: true,
  };
}

export async function activateJourneyDecision(
  command: ActivateJourneyCommand,
  context: JourneyDecisionRequestContext,
  dependencies: ActivateJourneyDecisionDependencies,
): Promise<JourneyDecisionReceipt> {
  const userId = requiredOpaqueId(context.principal.userId, "INVALID_JOURNEY");
  const requestId = requiredJourneyRequestId(context.requestId);
  const name = normalizedField(command.name);
  const activeCapability = normalizedField(command.activeCapability);
  const expectedCurrentJourneyId = expectedJourneyId(command.expectedCurrentJourneyId);

  if (command.approval.explicit !== true || command.approval.acknowledgement !== "ACTIVATE_JOURNEY") {
    throw new JourneyDecisionError("APPROVAL_REQUIRED");
  }

  const decidedAt = validInstant(context.receivedAt);
  const requestFingerprint = fingerprint(name, activeCapability, expectedCurrentJourneyId);

  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const existing = await transaction.findByRequestId(requestId, userId);
    if (existing) return replayReceipt(existing, requestFingerprint);

    const current = await transaction.getActiveForUpdate(userId);
    const actualCurrentJourneyId = current?.journeyId ?? null;
    if (actualCurrentJourneyId !== expectedCurrentJourneyId) {
      throw new JourneyDecisionError("CURRENT_JOURNEY_CHANGED");
    }
    if (current?.name === name && current.activeCapability === activeCapability) {
      throw new JourneyDecisionError("JOURNEY_UNCHANGED");
    }

    const recordedAt = validInstant(dependencies.clock.now());
    if (Date.parse(recordedAt) < Date.parse(decidedAt)) {
      throw new JourneyDecisionError("INVALID_JOURNEY");
    }

    const journeyId = dependencies.ids.next("journey");
    const eventId = dependencies.ids.next("event");
    requiredOpaqueId(journeyId, "INVALID_JOURNEY");
    requiredOpaqueId(eventId, "INVALID_JOURNEY");

    if (current) {
      await transaction.supersedeActive(current.journeyId, userId, recordedAt);
    }

    await transaction.createJourney({
      journeyId,
      userId,
      name,
      activeCapability,
      status: "ACTIVE",
      decidedAt,
      recordedAt,
      ...(current ? { supersedesJourneyId: current.journeyId } : {}),
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
      eventType: "JOURNEY_DECISION_ACTIVATED",
      entityType: "journey_decision",
      entityId: journeyId,
      source: context.source,
      correlationId: requestId,
      payloadJson: {
        authorityClass: "DECISION",
        name,
        activeCapability,
        ...(current ? { supersededJourneyId: current.journeyId } : {}),
      },
      schemaVersion: 1,
    });

    return {
      journeyId,
      status: "ACTIVE",
      authorityClass: "DECISION",
      decidedAt,
      ...(current ? { supersededJourneyId: current.journeyId } : {}),
      idempotentReplay: false,
    };
  });
}
