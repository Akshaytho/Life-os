import type { Pool, PoolClient } from "pg";
import type {
  AppliedProposalRecord,
  CalendarPlanRecord,
  DomainEventRecord,
  WriteTransaction,
  WriteUnitOfWork,
} from "../domain/write-boundary";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function transactionFor(client: PoolClient): WriteTransaction {
  return {
    async findAppliedProposal(proposalId) {
      const result = await client.query<{
        proposal_id: string;
        applied_at: Date;
        confirmed_by_actor_id: string;
        request_fingerprint: string;
        entity_type: "calendar_event";
        entity_id: string;
        event_id: string;
      }>(
        `SELECT proposal_id, applied_at, confirmed_by_actor_id, request_fingerprint,
                entity_type, entity_id, event_id
           FROM applied_proposal
          WHERE proposal_id = $1`,
        [proposalId],
      );

      const row = result.rows[0];
      if (!row) return undefined;

      return {
        proposalId: row.proposal_id,
        appliedAt: iso(row.applied_at),
        confirmedByActorId: row.confirmed_by_actor_id,
        requestFingerprint: row.request_fingerprint,
        entityType: row.entity_type,
        entityId: row.entity_id,
        eventId: row.event_id,
      } satisfies AppliedProposalRecord;
    },

    async createCalendarPlan(record: CalendarPlanRecord) {
      await client.query(
        `INSERT INTO calendar_event
          (id, user_id, title, starts_at, ends_at, category, commitment, created_at, source_proposal_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          record.id,
          record.userId,
          record.title,
          record.startsAt,
          record.endsAt,
          record.category,
          record.commitment,
          record.createdAt,
          record.sourceProposalId,
        ],
      );
    },

    async appendDomainEvent(event: DomainEventRecord) {
      await client.query(
        `INSERT INTO domain_event
          (event_id, user_id, occurred_at, recorded_at, actor_type, actor_id,
           event_type, entity_type, entity_id, source, correlation_id,
           causation_event_id, payload_json, schema_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)`,
        [
          event.eventId,
          event.userId,
          event.occurredAt,
          event.recordedAt,
          event.actorType,
          event.actorId ?? null,
          event.eventType,
          event.entityType,
          event.entityId,
          event.source,
          event.correlationId,
          event.causationEventId ?? null,
          JSON.stringify(event.payloadJson),
          event.schemaVersion,
        ],
      );
    },

    async markProposalApplied(record: AppliedProposalRecord) {
      await client.query(
        `INSERT INTO applied_proposal
          (proposal_id, applied_at, confirmed_by_actor_id, request_fingerprint,
           entity_type, entity_id, event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          record.proposalId,
          record.appliedAt,
          record.confirmedByActorId,
          record.requestFingerprint,
          record.entityType,
          record.entityId,
          record.eventId,
        ],
      );
    },
  };
}

export class PostgresWriteUnitOfWork implements WriteUnitOfWork {
  constructor(private readonly pool: Pool) {}

  async run<T>(work: (transaction: WriteTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await work(transactionFor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction error. A discarded pooled client will be
        // released below; production observability can record rollback failure later.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
