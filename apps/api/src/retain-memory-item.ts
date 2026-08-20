import { createHash } from "node:crypto";
import type { MemoryWriteReceipt, RetainMemoryItemCommand } from "../../../packages/contracts/memory";
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
  memoryRelationship,
  memoryRequestId,
  memorySourceDomain,
  memoryTitle,
} from "./memory-validation";

function fingerprint(value: object) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function retainMemoryItem(
  command: RetainMemoryItemCommand,
  context: MemoryRequestContext,
  dependencies: { unitOfWork: MemoryUnitOfWork; clock: MemoryClock; ids: MemoryIdGenerator },
): Promise<MemoryWriteReceipt> {
  const userId = memoryOpaqueId(context.principal.userId, "INVALID_PRINCIPAL");
  const requestId = memoryRequestId(context.requestId, "retain");
  const relationship = memoryRelationship(command.relationship);
  const relatedRootId = command.relatedRootId
    ? memoryOpaqueId(command.relatedRootId)
    : undefined;
  if ((relationship === "NEW") !== (relatedRootId === undefined)) {
    throw new MemoryError("INVALID_REQUEST");
  }
  const normalized = {
    sourceDomain: memorySourceDomain(command.sourceDomain),
    sourceEntityId: memoryOpaqueId(command.sourceEntityId),
    kind: memoryKind(command.kind),
    title: memoryTitle(command.title),
    body: memoryBody(command.body),
    relationship,
    ...(relatedRootId ? { relatedRootId } : {}),
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
        recordedAt: replay.recordedAt, idempotentReplay: true,
      };
    }
    const candidate = await transaction.getCandidateForUpdate(
      userId, normalized.sourceDomain, normalized.sourceEntityId,
    );
    if (!candidate || candidate.userId !== userId) throw new MemoryError("CANDIDATE_NOT_FOUND");
    if (await transaction.getCurrentBySourceForUpdate(
      userId, normalized.sourceDomain, normalized.sourceEntityId,
    )) throw new MemoryError("CANDIDATE_ALREADY_RETAINED");
    if (relatedRootId && !await transaction.getCurrentByRootForUpdate(userId, relatedRootId)) {
      throw new MemoryError("RELATED_MEMORY_NOT_FOUND");
    }
    const recordedAt = memoryInstant(dependencies.clock.now());
    if (Date.parse(recordedAt) < Date.parse(retainedAt)) throw new MemoryError("MEMORY_STATE_INVALID");
    const itemId = memoryOpaqueId(dependencies.ids.next("memory-item"));
    const eventId = memoryOpaqueId(dependencies.ids.next("event"));
    await transaction.create({
      itemId, rootId: itemId, revision: 1, userId,
      kind: normalized.kind, title: normalized.title, body: normalized.body,
      relationship: normalized.relationship,
      ...(normalized.relatedRootId ? { relatedRootId: normalized.relatedRootId } : {}),
      sourceDomain: normalized.sourceDomain, sourceEntityId: normalized.sourceEntityId,
      sourceOccurredAt: memoryInstant(candidate.sourceOccurredAt), status: "CURRENT",
      retainedAt, recordedAt, requestId, requestFingerprint,
    });
    await transaction.appendDomainEvent({
      eventId, userId, occurredAt: retainedAt, recordedAt,
      actorType: "USER", actorId: userId, eventType: "MEMORY_ITEM_RETAINED",
      entityType: "memory_item", entityId: itemId, source: context.source,
      correlationId: requestId,
      payloadJson: {
        rootId: itemId, revision: 1, kind: normalized.kind,
        authorityClass: "REFLECTION", sourceDomain: normalized.sourceDomain,
        sourceEntityId: normalized.sourceEntityId, relationship: normalized.relationship,
        ...(normalized.relatedRootId ? { relatedRootId: normalized.relatedRootId } : {}),
      },
      schemaVersion: 1,
    });
    return {
      itemId, rootId: itemId, revision: 1, status: "CURRENT",
      authorityClass: "REFLECTION", sourceDomain: normalized.sourceDomain,
      sourceEntityId: normalized.sourceEntityId, relationship: normalized.relationship,
      retainedAt, recordedAt, idempotentReplay: false,
    };
  });
}
