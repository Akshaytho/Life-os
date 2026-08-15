import type { Pool, PoolClient } from "pg";
import type {
  DirectionDecisionDomainEventRecord,
  DirectionDecisionRecord,
  DirectionDecisionTransaction,
  DirectionDecisionUnitOfWork,
} from "../domain/direction-decision";
import { PostgresUserScope } from "./postgres-user-scope";

type DirectionRow = {
  direction_id: string;
  user_id: string;
  statement: string;
  status: DirectionDecisionRecord["status"];
  decided_at: Date;
  recorded_at: Date;
  ended_at: Date | null;
  supersedes_direction_id: string | null;
  request_id: string;
  request_fingerprint: string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toRecord(row: DirectionRow): DirectionDecisionRecord {
  return {
    directionId: row.direction_id,
    userId: row.user_id,
    statement: row.statement,
    status: row.status,
    decidedAt: toIso(row.decided_at),
    recordedAt: toIso(row.recorded_at),
    ...(row.ended_at ? { endedAt: toIso(row.ended_at) } : {}),
    ...(row.supersedes_direction_id ? { supersedesDirectionId: row.supersedes_direction_id } : {}),
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
  };
}

class PostgresDirectionDecisionTransaction implements DirectionDecisionTransaction {
  constructor(private readonly client: PoolClient) {}

  async findByRequestId(requestId: string, userId: string): Promise<DirectionDecisionRecord | undefined> {
    const result = await this.client.query<DirectionRow>(
      `SELECT direction_id, user_id, statement, status, decided_at, recorded_at, ended_at,
              supersedes_direction_id, request_id, request_fingerprint
         FROM direction_decision
        WHERE request_id = $1 AND user_id = $2
        FOR UPDATE`,
      [requestId, userId],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : undefined;
  }

  async getActiveForUpdate(userId: string): Promise<DirectionDecisionRecord | undefined> {
    const result = await this.client.query<DirectionRow>(
      `SELECT direction_id, user_id, statement, status, decided_at, recorded_at, ended_at,
              supersedes_direction_id, request_id, request_fingerprint
         FROM direction_decision
        WHERE user_id = $1 AND status = 'ACTIVE'
        FOR UPDATE`,
      [userId],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : undefined;
  }

  async supersedeActive(directionId: string, userId: string, endedAt: string): Promise<void> {
    const result = await this.client.query(
      `UPDATE direction_decision
          SET status = 'SUPERSEDED', ended_at = $3
        WHERE direction_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
      [directionId, userId, endedAt],
    );
    if (result.rowCount !== 1) throw new Error("Direction supersession conflict");
  }

  async createDirection(record: DirectionDecisionRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO direction_decision
        (direction_id, user_id, statement, status, decided_at, recorded_at, ended_at,
         supersedes_direction_id, request_id, request_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        record.directionId,
        record.userId,
        record.statement,
        record.status,
        record.decidedAt,
        record.recordedAt,
        record.endedAt ?? null,
        record.supersedesDirectionId ?? null,
        record.requestId,
        record.requestFingerprint,
      ],
    );
  }

  async appendDomainEvent(event: DirectionDecisionDomainEventRecord): Promise<void> {
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

/**
 * Dormant high-authority adapter. It is intentionally not part of the ordinary private
 * runtime composition until the hosted database has migration 0007 and reviewed role
 * privileges. A transaction-scoped advisory lock serializes Direction replacement even
 * when the user does not yet have an ACTIVE row that can be row-locked.
 */
export class PostgresDirectionDecisionUnitOfWork implements DirectionDecisionUnitOfWork {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  run<T>(authenticatedUserId: string, work: (transaction: DirectionDecisionTransaction) => Promise<T>): Promise<T> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [authenticatedUserId]);
      return work(new PostgresDirectionDecisionTransaction(client));
    });
  }
}
