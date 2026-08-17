import type { Pool, PoolClient } from "pg";
import type {
  JourneyDecisionDomainEventRecord,
  JourneyDecisionRecord,
  JourneyDecisionTransaction,
  JourneyDecisionUnitOfWork,
} from "../domain/journey-decision";
import { PostgresUserScope } from "./postgres-user-scope";

type JourneyRow = {
  journey_id: string;
  user_id: string;
  name: string;
  active_capability: string;
  status: JourneyDecisionRecord["status"];
  decided_at: Date;
  recorded_at: Date;
  ended_at: Date | null;
  supersedes_journey_id: string | null;
  request_id: string;
  request_fingerprint: string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toRecord(row: JourneyRow): JourneyDecisionRecord {
  return {
    journeyId: row.journey_id,
    userId: row.user_id,
    name: row.name,
    activeCapability: row.active_capability,
    status: row.status,
    decidedAt: toIso(row.decided_at),
    recordedAt: toIso(row.recorded_at),
    ...(row.ended_at ? { endedAt: toIso(row.ended_at) } : {}),
    ...(row.supersedes_journey_id ? { supersedesJourneyId: row.supersedes_journey_id } : {}),
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
  };
}

class PostgresJourneyDecisionTransaction implements JourneyDecisionTransaction {
  constructor(private readonly client: PoolClient) {}

  async findByRequestId(requestId: string, userId: string): Promise<JourneyDecisionRecord | undefined> {
    const result = await this.client.query<JourneyRow>(
      `SELECT journey_id, user_id, name, active_capability, status, decided_at, recorded_at, ended_at,
              supersedes_journey_id, request_id, request_fingerprint
         FROM journey_decision
        WHERE request_id = $1 AND user_id = $2
        FOR UPDATE`,
      [requestId, userId],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : undefined;
  }

  async getActiveForUpdate(userId: string): Promise<JourneyDecisionRecord | undefined> {
    const result = await this.client.query<JourneyRow>(
      `SELECT journey_id, user_id, name, active_capability, status, decided_at, recorded_at, ended_at,
              supersedes_journey_id, request_id, request_fingerprint
         FROM journey_decision
        WHERE user_id = $1 AND status = 'ACTIVE'
        FOR UPDATE`,
      [userId],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : undefined;
  }

  async supersedeActive(journeyId: string, userId: string, endedAt: string): Promise<void> {
    const result = await this.client.query(
      `UPDATE journey_decision
          SET status = 'SUPERSEDED', ended_at = $3
        WHERE journey_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
      [journeyId, userId, endedAt],
    );
    if (result.rowCount !== 1) throw new Error("Journey supersession conflict");
  }

  async createJourney(record: JourneyDecisionRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO journey_decision
        (journey_id, user_id, name, active_capability, status, decided_at, recorded_at, ended_at,
         supersedes_journey_id, request_id, request_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        record.journeyId,
        record.userId,
        record.name,
        record.activeCapability,
        record.status,
        record.decidedAt,
        record.recordedAt,
        record.endedAt ?? null,
        record.supersedesJourneyId ?? null,
        record.requestId,
        record.requestFingerprint,
      ],
    );
  }

  async appendDomainEvent(event: JourneyDecisionDomainEventRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO domain_event
        (event_id, user_id, occurred_at, recorded_at, actor_type, actor_id, event_type,
         entity_type, entity_id, source, correlation_id, causation_event_id, payload_json, schema_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12::jsonb, $13)`,
      [
        event.eventId,
        event.userId,
        event.occurredAt,
        event.recordedAt,
        event.actorType,
        event.actorId,
        event.eventType,
        event.entityType,
        event.entityId,
        event.source,
        event.correlationId,
        JSON.stringify(event.payloadJson),
        event.schemaVersion,
      ],
    );
  }
}

export class PostgresJourneyDecisionUnitOfWork implements JourneyDecisionUnitOfWork {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  run<T>(authenticatedUserId: string, work: (transaction: JourneyDecisionTransaction) => Promise<T>): Promise<T> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [authenticatedUserId]);
      return work(new PostgresJourneyDecisionTransaction(client));
    });
  }
}
