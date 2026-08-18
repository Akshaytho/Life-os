import { createHash } from "node:crypto";
import type { MemoryWriteReceipt, ReviseMemoryItemCommand } from "../../../packages/contracts/memory";
import type {
  MemoryClock,
  MemoryIdGenerator,
  MemoryRequestContext,
  MemoryUnitOfWork,
} from "../../../packages/domain/memory";
import {
  memoryBody,
  MemoryError,
  memoryInstant,
  memoryKind,
  memoryOpaqueId,
  memoryRequestId,
  memoryTitle,
} from "./memory-validation";

function fingerprint(value: object) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function reviseMemoryItem(
  rootIdValue: string,
  command: ReviseMemoryItemCommand,
  context: MemoryRequestContext,
  dependencies: { unitOfWork: MemoryUnitOfWork; clock: MemoryClock; ids: MemoryIdGenerator },
): Promise<MemoryWriteReceipt> {
  const userId = memoryOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const rootId = memoryOpaqueId(rootIdValue);
  const requestId = memoryRequestId(context.requestId, "revise");
  const normalized = {
    rootId,
    expectedCurrentItemId: memoryOpaqueId(command.expectedCurrentItemId),
    kind: memoryKind(command.kind),
    title: memoryTitle(command.title),
    body: memoryBody(command.body),
  };
  const requestFingerprint = fingerprint(normalized);
  const retainedAt = memoryInstant(context.receivedAt);
  return dependencies.unitOfWork.run(userId, async (transaction) => {
    const replay = await transaction.findByRequestId(requestId, userId);
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) throw new MemoryError("IDEMPOTENCY_CONFLICT");
      return {
        itemId: replay.itemId, rootId: replay.rootId, revision: replay.revision,
        status: replay.status, authorityClass: "REFLECTION",
        sourceDomain: replay.sourceDomain, sourceEntityId: replay.sourceEntityId,
        relationship: replay.relationship, retainedAt: replay.retainedAt,
        recordedAt: replay.recordedAt,
        ...(replay.supersedesItemId ? { supersededItemId: replay.supersedesItemId } : {}),
        idempotentReplay: true,
      };
    }
    const current = await transaction.getCurrentByRootForUpdate(userId, rootId);
    if (!current || current.itemId !== normalized.expectedCurrentItemId) {
      throw new MemoryError("CURRENT_MEMORY_CHANGED");
    }
    if (current.kind === normalized.kind && current.title === normalized.title && current.body === normalized.body) {
      throw new MemoryError("MEMORY_UNCHANGED");
    }
    const recordedAt = memoryInstant(dependencies.clock.now());
    if (Date.parse(recordedAt) < Date.parse(retainedAt)) throw new MemoryError("MEMORY_STATE_INVALID");
    const itemId = memoryOpaqueId(dependencies.ids.next("memory-item"));
    const eventId = memoryOpaqueId(dependencies.ids.next("event"));
    await transaction.supersede(current.itemId, userId, recordedAt);
    await transaction.create({
      itemId, rootId, revision: current.revision + 1, userId,
      kind: normalized.kind, title: normalized.title, body: normalized.body,
      relationship: current.relationship,
      ...(current.relatedRootId ? { relatedRootId: current.relatedRootId } : {}),
      sourceDomain: current.sourceDomain, sourceEntityId: current.sourceEntityId,
      sourceOccurredAt: current.sourceOccurredAt, status: "CURRENT",
      retainedAt, recordedAt, supersedesItemId: current.itemId,
      requestId, requestFingerprint,
    });
    await transaction.appendDomainEvent({
      eventId, userId, occurredAt: retainedAt, recordedAt,
      actorType: "USER", actorId: userId, eventType: "MEMORY_ITEM_REVISED",
      entityType: "memory_item", entityId: itemId, source: context.source,
      correlationId: requestId,
      payloadJson: {
        rootId, revision: current.revision + 1, kind: normalized.kind,
        authorityClass: "REFLECTION", sourceDomain: current.sourceDomain,
        sourceEntityId: current.sourceEntityId, relationship: current.relationship,
        ...(current.relatedRootId ? { relatedRootId: current.relatedRootId } : {}),
        supersededItemId: current.itemId,
      },
      schemaVersion: 1,
    });
    return {
      itemId, rootId, revision: current.revision + 1, status: "CURRENT",
      authorityClass: "REFLECTION", sourceDomain: current.sourceDomain,
      sourceEntityId: current.sourceEntityId, relationship: current.relationship,
      retainedAt, recordedAt, supersededItemId: current.itemId,
      idempotentReplay: false,
    };
  });
}
