import type { Pool, PoolClient } from "pg";
import type {
  DailyLogEntryRecord,
  DailyReturnDomainEventRecord,
  DailyReturnReviewRecord,
  DailyReturnTransaction,
  DailyReturnUnitOfWork,
} from "../domain/daily-return";
import { PostgresUserScope } from "./postgres-user-scope";

type DailyLogEntryRow = {
  daily_log_entry_id: string;
  user_id: string;
  local_date: string;
  time_zone: string;
  body: string;
  occurred_at: Date;
  recorded_at: Date;
  request_id: string;
  request_fingerprint: string;
};

type DailyReturnReviewRow = {
  daily_return_review_id: string;
  user_id: string;
  local_date: string;
  time_zone: string;
  what_happened: string;
  what_moved_forward: string;
  what_pulled_me_away: string;
  return_to_tomorrow: string;
  return_state: DailyReturnReviewRecord["returnState"];
  status: DailyReturnReviewRecord["status"];
  submitted_at: Date;
  recorded_at: Date;
  ended_at: Date | null;
  supersedes_review_id: string | null;
  request_id: string;
  request_fingerprint: string;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toLogEntry(row: DailyLogEntryRow): DailyLogEntryRecord {
  return {
    entryId: row.daily_log_entry_id,
    userId: row.user_id,
    localDate: row.local_date,
    timeZone: row.time_zone,
    body: row.body,
    occurredAt: iso(row.occurred_at),
    recordedAt: iso(row.recorded_at),
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
  };
}

function toReview(row: DailyReturnReviewRow): DailyReturnReviewRecord {
  return {
    reviewId: row.daily_return_review_id,
    userId: row.user_id,
    localDate: row.local_date,
    timeZone: row.time_zone,
    whatHappened: row.what_happened,
    whatMovedForward: row.what_moved_forward,
    whatPulledMeAway: row.what_pulled_me_away,
    returnToTomorrow: row.return_to_tomorrow,
    returnState: row.return_state,
    status: row.status,
    submittedAt: iso(row.submitted_at),
    recordedAt: iso(row.recorded_at),
    ...(row.ended_at ? { endedAt: iso(row.ended_at) } : {}),
    ...(row.supersedes_review_id ? { supersedesReviewId: row.supersedes_review_id } : {}),
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
  };
}

class PostgresDailyReturnTransaction implements DailyReturnTransaction {
  constructor(private readonly client: PoolClient) {}

  async findLogEntryByRequestId(
    requestId: string,
    userId: string,
  ): Promise<DailyLogEntryRecord | undefined> {
    const result = await this.client.query<DailyLogEntryRow>(
      `SELECT daily_log_entry_id, user_id, local_date::text, time_zone, body,
              occurred_at, recorded_at, request_id, request_fingerprint
         FROM daily_log_entry
        WHERE request_id = $1 AND user_id = $2`,
      [requestId, userId],
    );
    return result.rows[0] ? toLogEntry(result.rows[0]) : undefined;
  }

  async createLogEntry(record: DailyLogEntryRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO daily_log_entry
        (daily_log_entry_id, user_id, local_date, time_zone, body, occurred_at,
         recorded_at, request_id, request_fingerprint)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)`,
      [
        record.entryId,
        record.userId,
        record.localDate,
        record.timeZone,
        record.body,
        record.occurredAt,
        record.recordedAt,
        record.requestId,
        record.requestFingerprint,
      ],
    );
  }

  async findReviewByRequestId(
    requestId: string,
    userId: string,
  ): Promise<DailyReturnReviewRecord | undefined> {
    const result = await this.client.query<DailyReturnReviewRow>(
      `SELECT daily_return_review_id, user_id, local_date::text, time_zone,
              what_happened, what_moved_forward, what_pulled_me_away,
              return_to_tomorrow, return_state, status, submitted_at, recorded_at,
              ended_at, supersedes_review_id, request_id, request_fingerprint
         FROM daily_return_review
        WHERE request_id = $1 AND user_id = $2
        FOR UPDATE`,
      [requestId, userId],
    );
    return result.rows[0] ? toReview(result.rows[0]) : undefined;
  }

  async getCurrentReviewForUpdate(
    userId: string,
    localDate: string,
  ): Promise<DailyReturnReviewRecord | undefined> {
    const result = await this.client.query<DailyReturnReviewRow>(
      `SELECT daily_return_review_id, user_id, local_date::text, time_zone,
              what_happened, what_moved_forward, what_pulled_me_away,
              return_to_tomorrow, return_state, status, submitted_at, recorded_at,
              ended_at, supersedes_review_id, request_id, request_fingerprint
         FROM daily_return_review
        WHERE user_id = $1 AND local_date = $2::date AND status = 'CURRENT'
        FOR UPDATE`,
      [userId, localDate],
    );
    return result.rows[0] ? toReview(result.rows[0]) : undefined;
  }

  async supersedeCurrentReview(reviewId: string, userId: string, endedAt: string): Promise<void> {
    const result = await this.client.query(
      `UPDATE daily_return_review
          SET status = 'SUPERSEDED', ended_at = $3
        WHERE daily_return_review_id = $1 AND user_id = $2 AND status = 'CURRENT'`,
      [reviewId, userId, endedAt],
    );
    if (result.rowCount !== 1) throw new Error("Daily Return review supersession conflict");
  }

  async createReview(record: DailyReturnReviewRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO daily_return_review
        (daily_return_review_id, user_id, local_date, time_zone, what_happened,
         what_moved_forward, what_pulled_me_away, return_to_tomorrow, return_state,
         status, submitted_at, recorded_at, ended_at, supersedes_review_id,
         request_id, request_fingerprint)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        record.reviewId,
        record.userId,
        record.localDate,
        record.timeZone,
        record.whatHappened,
        record.whatMovedForward,
        record.whatPulledMeAway,
        record.returnToTomorrow,
        record.returnState,
        record.status,
        record.submittedAt,
        record.recordedAt,
        record.endedAt ?? null,
        record.supersedesReviewId ?? null,
        record.requestId,
        record.requestFingerprint,
      ],
    );
  }

  async appendDomainEvent(event: DailyReturnDomainEventRecord): Promise<void> {
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

export class PostgresDailyReturnUnitOfWork implements DailyReturnUnitOfWork {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  run<T>(
    authenticatedUserId: string,
    work: (transaction: DailyReturnTransaction) => Promise<T>,
  ): Promise<T> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`daily-return:${authenticatedUserId}`],
      );
      return work(new PostgresDailyReturnTransaction(client));
    });
  }
}
