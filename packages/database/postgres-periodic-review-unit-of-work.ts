import type { Pool, PoolClient } from "pg";
import type {
  PeriodicReviewDomainEventRecord,
  PeriodicReviewRecord,
  PeriodicReviewTransaction,
  PeriodicReviewUnitOfWork,
} from "../domain/periodic-reviews";
import { PostgresUserScope } from "./postgres-user-scope";

export type PeriodicReviewRow = {
  periodic_review_id: string;
  user_id: string;
  period_kind: PeriodicReviewRecord["kind"];
  period_start: string;
  period_end: string;
  time_zone: string;
  what_mattered: string;
  what_changed: string;
  what_moved_forward: string;
  drift_and_return: string;
  what_was_learned: string;
  carry_forward: string;
  worth_preserving: string | null;
  status: PeriodicReviewRecord["status"];
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

export function periodicReviewFromRow(row: PeriodicReviewRow): PeriodicReviewRecord {
  return {
    reviewId: row.periodic_review_id,
    userId: row.user_id,
    kind: row.period_kind,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    timeZone: row.time_zone,
    whatMattered: row.what_mattered,
    whatChanged: row.what_changed,
    whatMovedForward: row.what_moved_forward,
    driftAndReturn: row.drift_and_return,
    whatWasLearned: row.what_was_learned,
    carryForward: row.carry_forward,
    ...(row.worth_preserving ? { worthPreserving: row.worth_preserving } : {}),
    status: row.status,
    submittedAt: iso(row.submitted_at),
    recordedAt: iso(row.recorded_at),
    ...(row.ended_at ? { endedAt: iso(row.ended_at) } : {}),
    ...(row.supersedes_review_id ? { supersedesReviewId: row.supersedes_review_id } : {}),
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
  };
}

const selectColumns = `periodic_review_id, user_id, period_kind,
  period_start::text, period_end::text, time_zone, what_mattered, what_changed,
  what_moved_forward, drift_and_return, what_was_learned, carry_forward,
  worth_preserving, status, submitted_at, recorded_at, ended_at,
  supersedes_review_id, request_id, request_fingerprint`;

class PostgresPeriodicReviewTransaction implements PeriodicReviewTransaction {
  constructor(private readonly client: PoolClient) {}

  async findByRequestId(requestId: string, userId: string) {
    const result = await this.client.query<PeriodicReviewRow>(
      `SELECT ${selectColumns} FROM periodic_review
        WHERE request_id = $1 AND user_id = $2 FOR UPDATE`,
      [requestId, userId],
    );
    return result.rows[0] ? periodicReviewFromRow(result.rows[0]) : undefined;
  }

  async getCurrentForUpdate(
    userId: string,
    kind: PeriodicReviewRecord["kind"],
    periodStart: string,
  ) {
    const result = await this.client.query<PeriodicReviewRow>(
      `SELECT ${selectColumns} FROM periodic_review
        WHERE user_id = $1 AND period_kind = $2 AND period_start = $3::date
          AND status = 'CURRENT'
        FOR UPDATE`,
      [userId, kind, periodStart],
    );
    return result.rows[0] ? periodicReviewFromRow(result.rows[0]) : undefined;
  }

  async supersede(reviewId: string, userId: string, endedAt: string): Promise<void> {
    const result = await this.client.query(
      `UPDATE periodic_review SET status = 'SUPERSEDED', ended_at = $3
        WHERE periodic_review_id = $1 AND user_id = $2 AND status = 'CURRENT'`,
      [reviewId, userId, endedAt],
    );
    if (result.rowCount !== 1) throw new Error("Periodic review supersession conflict");
  }

  async create(record: PeriodicReviewRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO periodic_review
        (periodic_review_id, user_id, period_kind, period_start, period_end,
         time_zone, what_mattered, what_changed, what_moved_forward,
         drift_and_return, what_was_learned, carry_forward, worth_preserving,
         authority_class, status, submitted_at, recorded_at, ended_at,
         supersedes_review_id, request_id, request_fingerprint)
       VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, $11,
               $12, $13, 'REFLECTION', $14, $15, $16, $17, $18, $19, $20)`,
      [
        record.reviewId, record.userId, record.kind, record.periodStart, record.periodEnd,
        record.timeZone, record.whatMattered, record.whatChanged, record.whatMovedForward,
        record.driftAndReturn, record.whatWasLearned, record.carryForward,
        record.worthPreserving ?? null, record.status, record.submittedAt,
        record.recordedAt, record.endedAt ?? null, record.supersedesReviewId ?? null,
        record.requestId, record.requestFingerprint,
      ],
    );
  }

  async appendDomainEvent(event: PeriodicReviewDomainEventRecord): Promise<void> {
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

export class PostgresPeriodicReviewUnitOfWork implements PeriodicReviewUnitOfWork {
  private readonly userScope: PostgresUserScope;
  constructor(pool: Pool) { this.userScope = new PostgresUserScope(pool) }

  run<T>(authenticatedUserId: string, work: (transaction: PeriodicReviewTransaction) => Promise<T>) {
    return this.userScope.run(authenticatedUserId, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `periodic-review:${authenticatedUserId}`,
      ]);
      return work(new PostgresPeriodicReviewTransaction(client));
    });
  }
}
