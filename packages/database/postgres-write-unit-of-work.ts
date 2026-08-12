import type { Pool, PoolClient } from "pg";
import type {
  AppliedProposalRecord,
  CalendarPlanInput,
  CalendarPlanRecord,
  DomainEventRecord,
  StoredCalendarProposal,
  WriteTransaction,
  WriteUnitOfWork,
} from "../domain/write-boundary";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function transactionFor(client: PoolClient): WriteTransaction {
  return {
    async getStoredCalendarProposalForUpdate(proposalId, userId) {
      const result = await client.query<{
        proposal_id: string;
        user_id: string;
        capture_id: string;
        raw_text: string;
        correlation_id: string;
        destination: "CALENDAR";
        operation: "CREATE_CALENDAR_PLAN";
        approval_mode: StoredCalendarProposal["approvalMode"];
        state: StoredCalendarProposal["state"];
        payload_json: CalendarPlanInput;
        created_at: Date;
        applied_at: Date | null;
        applied_entity_id: string | null;
        applied_event_id: string | null;
      }>(
        `SELECT rp.proposal_id, rp.user_id, rp.capture_id, c.raw_text, c.correlation_id,
                rp.destination, rp.operation, rp.approval_mode, rp.state, rp.payload_json,
                rp.created_at, rp.applied_at, rp.applied_entity_id, rp.applied_event_id
           FROM routing_proposal rp
           JOIN capture_record c
             ON c.capture_id = rp.capture_id AND c.user_id = rp.user_id
          WHERE rp.proposal_id = $1 AND rp.user_id = $2
          FOR UPDATE OF rp`,
        [proposalId, userId],
      );

      const row = result.rows[0];
      if (!row) return undefined;

      return {
        proposalId: row.proposal_id,
        userId: row.user_id,
        captureId: row.capture_id,
        sourceText: row.raw_text,
        correlationId: row.correlation_id,
        destination: row.destination,
        operation: row.operation,
        approvalMode: row.approval_mode,
        state: row.state,
        plan: row.payload_json,
        createdAt: iso(row.created_at),
        appliedAt: row.applied_at ? iso(row.applied_at) : undefined,
        appliedEntityId: row.applied_entity_id ?? undefined,
        appliedEventId: row.applied_event_id ?? undefined,
      } satisfies StoredCalendarProposal;
    },

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
        [record.id, record.userId, record.title, record.startsAt, record.endsAt, record.category,
          record.commitment, record.createdAt, record.sourceProposalId],
      );
    },

    async appendDomainEvent(event: DomainEventRecord) {
      await client.query(
        `INSERT INTO domain_event
          (event_id, user_id, occurred_at, recorded_at, actor_type, actor_id,
           event_type, entity_type, entity_id, source, correlation_id,
           causation_event_id, payload_json, schema_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)`,
        [event.eventId, event.userId, event.occurredAt, event.recordedAt, event.actorType,
          event.actorId ?? null, event.eventType, event.entityType, event.entityId, event.source,
          event.correlationId, event.causationEventId ?? null, JSON.stringify(event.payloadJson), event.schemaVersion],
      );
    },

    async markProposalApplied(record: AppliedProposalRecord) {
      await client.query(
        `INSERT INTO applied_proposal
          (proposal_id, applied_at, confirmed_by_actor_id, request_fingerprint,
           entity_type, entity_id, event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [record.proposalId, record.appliedAt, record.confirmedByActorId, record.requestFingerprint,
          record.entityType, record.entityId, record.eventId],
      );
    },

    async markStoredProposalApplied(proposalId, userId, appliedAt, entityId, eventId) {
      const result = await client.query(
        `UPDATE routing_proposal
            SET state = 'APPLIED', applied_at = $3, applied_entity_id = $4, applied_event_id = $5
          WHERE proposal_id = $1 AND user_id = $2 AND state = 'READY_TO_APPLY'`,
        [proposalId, userId, appliedAt, entityId, eventId],
      );
      if (result.rowCount !== 1) throw new Error(`Stored proposal ${proposalId} was not ready to apply`);
    },
  };
}

export class PostgresWriteUnitOfWork implements WriteUnitOfWork {
  constructor(private readonly pool: Pool) {}

  async run<T>(work: (transaction: WriteTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let discardClient = false;

    try {
      await client.query("BEGIN");
      const result = await work(transactionFor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        discardClient = true;
      }
      throw error;
    } finally {
      client.release(discardClient);
    }
  }
}
