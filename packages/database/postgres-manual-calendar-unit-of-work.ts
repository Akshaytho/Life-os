import type { Pool, PoolClient } from "pg";
import type { DomainEventRecord } from "../domain/write-boundary";
import type {
  ManualCalendarRecord,
  ManualCalendarTransaction,
  ManualCalendarUnitOfWork,
} from "../domain/manual-calendar";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type CalendarRow = {
  id: string;
  user_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  category: ManualCalendarRecord["category"];
  commitment: ManualCalendarRecord["commitment"];
  created_at: Date;
  source_proposal_id: string;
};

function fromRow(row: CalendarRow): ManualCalendarRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    category: row.category,
    commitment: row.commitment,
    createdAt: iso(row.created_at),
    sourceKey: row.source_proposal_id,
  };
}

class PostgresManualCalendarTransaction implements ManualCalendarTransaction {
  constructor(private readonly client: PoolClient) {}

  async findBySourceKey(sourceKey: string, userId: string): Promise<ManualCalendarRecord | undefined> {
    const result = await this.client.query<CalendarRow>(
      `SELECT id, user_id, title, starts_at, ends_at, category, commitment, created_at, source_proposal_id
         FROM calendar_event
        WHERE source_proposal_id = $1 AND user_id = $2
        FOR UPDATE`,
      [sourceKey, userId],
    );
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async create(record: ManualCalendarRecord): Promise<void> {
    await this.client.query(
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
        record.sourceKey,
      ],
    );
  }

  async appendDomainEvent(event: DomainEventRecord): Promise<void> {
    await this.client.query(
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
  }
}

export class PostgresManualCalendarUnitOfWork implements ManualCalendarUnitOfWork {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  run<T>(
    authenticatedUserId: string,
    work: (transaction: ManualCalendarTransaction) => Promise<T>,
  ): Promise<T> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`manual-calendar:${authenticatedUserId}`],
      );
      return work(new PostgresManualCalendarTransaction(client));
    });
  }
}
