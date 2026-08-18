import type { Pool, PoolClient } from "pg";
import type { MemorySourceDomain } from "../contracts/memory";
import type {
  MemoryCandidateRecord,
  MemoryDomainEventRecord,
  MemoryItemRecord,
  MemoryTransaction,
  MemoryUnitOfWork,
} from "../domain/memory";
import { PostgresUserScope } from "./postgres-user-scope";

type MemoryItemRow = {
  memory_item_id: string;
  root_id: string;
  revision: number;
  user_id: string;
  kind: MemoryItemRecord["kind"];
  title: string;
  body: string;
  relationship: MemoryItemRecord["relationship"];
  related_root_id: string | null;
  source_domain: MemoryItemRecord["sourceDomain"];
  source_entity_id: string;
  source_occurred_at: Date;
  status: MemoryItemRecord["status"];
  retained_at: Date;
  recorded_at: Date;
  ended_at: Date | null;
  supersedes_memory_item_id: string | null;
  request_id: string;
  request_fingerprint: string;
};

const columns = `memory_item_id, root_id, revision, user_id, kind, title, body,
  relationship, related_root_id, source_domain, source_entity_id,
  source_occurred_at, status, retained_at, recorded_at, ended_at,
  supersedes_memory_item_id, request_id, request_fingerprint`;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function memoryItemFromRow(row: MemoryItemRow): MemoryItemRecord {
  return {
    itemId: row.memory_item_id,
    rootId: row.root_id,
    revision: row.revision,
    userId: row.user_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    relationship: row.relationship,
    ...(row.related_root_id ? { relatedRootId: row.related_root_id } : {}),
    sourceDomain: row.source_domain,
    sourceEntityId: row.source_entity_id,
    sourceOccurredAt: iso(row.source_occurred_at),
    status: row.status,
    retainedAt: iso(row.retained_at),
    recordedAt: iso(row.recorded_at),
    ...(row.ended_at ? { endedAt: iso(row.ended_at) } : {}),
    ...(row.supersedes_memory_item_id ? { supersedesItemId: row.supersedes_memory_item_id } : {}),
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
  };
}

class PostgresMemoryTransaction implements MemoryTransaction {
  constructor(private readonly client: PoolClient) {}

  async findByRequestId(requestId: string, userId: string) {
    const result = await this.client.query<MemoryItemRow>(
      `SELECT ${columns} FROM memory_item
        WHERE request_id = $1 AND user_id = $2 FOR UPDATE`,
      [requestId, userId],
    );
    return result.rows[0] ? memoryItemFromRow(result.rows[0]) : undefined;
  }

  async getCandidateForUpdate(
    userId: string,
    sourceDomain: MemorySourceDomain,
    sourceEntityId: string,
  ): Promise<MemoryCandidateRecord | undefined> {
    if (sourceDomain === "PERIODIC_REVIEW") {
      const result = await this.client.query<{
        user_id: string; source_entity_id: string; source_label: string;
        source_body: string; source_occurred_at: Date;
      }>(
        `SELECT user_id, periodic_review_id AS source_entity_id,
                period_kind || ' review · ' || period_start::text || ' — ' || period_end::text AS source_label,
                worth_preserving AS source_body, submitted_at AS source_occurred_at
           FROM periodic_review
          WHERE user_id = $1 AND periodic_review_id = $2 AND status = 'CURRENT'
            AND worth_preserving IS NOT NULL AND length(btrim(worth_preserving)) > 0
          FOR UPDATE`,
        [userId, sourceEntityId],
      );
      const row = result.rows[0];
      return row ? {
        userId: row.user_id,
        sourceDomain,
        sourceEntityId: row.source_entity_id,
        sourceLabel: row.source_label,
        sourceBody: row.source_body,
        sourceOccurredAt: iso(row.source_occurred_at),
      } : undefined;
    }
    const result = await this.client.query<{
      user_id: string; source_entity_id: string; source_label: string;
      source_body: string; source_occurred_at: Date;
    }>(
      `SELECT completion.user_id,
              completion.practice_completion_id AS source_entity_id,
              'Journey practice · ' || replace(session.technique, '_', ' ') AS source_label,
              completion.retained_learning_candidate AS source_body,
              completion.completed_at AS source_occurred_at
         FROM journey_practice_completion completion
         JOIN journey_practice_session session
           ON session.practice_session_id = completion.practice_session_id
          AND session.user_id = completion.user_id
        WHERE completion.user_id = $1 AND completion.practice_completion_id = $2
          AND completion.retained_learning_candidate IS NOT NULL
          AND length(btrim(completion.retained_learning_candidate)) > 0`,
      [userId, sourceEntityId],
    );
    const row = result.rows[0];
    return row ? {
      userId: row.user_id,
      sourceDomain,
      sourceEntityId: row.source_entity_id,
      sourceLabel: row.source_label,
      sourceBody: row.source_body,
      sourceOccurredAt: iso(row.source_occurred_at),
    } : undefined;
  }

  async getCurrentBySourceForUpdate(
    userId: string,
    sourceDomain: MemorySourceDomain,
    sourceEntityId: string,
  ) {
    const result = await this.client.query<MemoryItemRow>(
      `SELECT ${columns} FROM memory_item
        WHERE user_id = $1 AND source_domain = $2 AND source_entity_id = $3
          AND status = 'CURRENT' FOR UPDATE`,
      [userId, sourceDomain, sourceEntityId],
    );
    return result.rows[0] ? memoryItemFromRow(result.rows[0]) : undefined;
  }

  async getCurrentByRootForUpdate(userId: string, rootId: string) {
    const result = await this.client.query<MemoryItemRow>(
      `SELECT ${columns} FROM memory_item
        WHERE user_id = $1 AND root_id = $2 AND status = 'CURRENT' FOR UPDATE`,
      [userId, rootId],
    );
    return result.rows[0] ? memoryItemFromRow(result.rows[0]) : undefined;
  }

  async supersede(itemId: string, userId: string, endedAt: string) {
    const result = await this.client.query(
      `UPDATE memory_item SET status = 'SUPERSEDED', ended_at = $3
        WHERE memory_item_id = $1 AND user_id = $2 AND status = 'CURRENT'`,
      [itemId, userId, endedAt],
    );
    if (result.rowCount !== 1) throw new Error("Memory supersession conflict");
  }

  async create(record: MemoryItemRecord) {
    await this.client.query(
      `INSERT INTO memory_item
        (memory_item_id, root_id, revision, user_id, kind, title, body,
         authority_class, source_domain, source_entity_id, source_occurred_at,
         relationship, related_root_id, status, retained_at, recorded_at,
         ended_at, supersedes_memory_item_id, request_id, request_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'REFLECTION', $8, $9, $10,
               $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        record.itemId, record.rootId, record.revision, record.userId, record.kind,
        record.title, record.body, record.sourceDomain, record.sourceEntityId,
        record.sourceOccurredAt, record.relationship, record.relatedRootId ?? null,
        record.status, record.retainedAt, record.recordedAt, record.endedAt ?? null,
        record.supersedesItemId ?? null, record.requestId, record.requestFingerprint,
      ],
    );
  }

  async appendDomainEvent(event: MemoryDomainEventRecord) {
    await this.client.query(
      `INSERT INTO domain_event
        (event_id, user_id, occurred_at, recorded_at, actor_type, actor_id,
         event_type, entity_type, entity_id, source, correlation_id,
         causation_event_id, payload_json, schema_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12::jsonb, $13)`,
      [
        event.eventId, event.userId, event.occurredAt, event.recordedAt,
        event.actorType, event.actorId, event.eventType, event.entityType,
        event.entityId, event.source, event.correlationId,
        JSON.stringify(event.payloadJson), event.schemaVersion,
      ],
    );
  }
}

export class PostgresMemoryUnitOfWork implements MemoryUnitOfWork {
  private readonly userScope: PostgresUserScope;
  constructor(pool: Pool) { this.userScope = new PostgresUserScope(pool) }

  run<T>(authenticatedUserId: string, work: (transaction: MemoryTransaction) => Promise<T>) {
    return this.userScope.run(authenticatedUserId, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `memory:${authenticatedUserId}`,
      ]);
      return work(new PostgresMemoryTransaction(client));
    });
  }
}
