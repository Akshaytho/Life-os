import type { Pool, PoolClient } from "pg";
import type {
  BrainDumpCaptureRecord,
  BrainDumpClassificationRecord,
  BrainDumpNotNowDomainEventRecord,
  BrainDumpNotNowTransaction,
  BrainDumpNotNowUnitOfWork,
  NotNowItemRecord,
} from "../domain/brain-dump-not-now";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type CaptureRow = {
  capture_id: string;
  user_id: string;
  raw_text: string;
  source: BrainDumpCaptureRecord["source"];
  received_at: Date;
  recorded_at: Date;
};

type ClassificationRow = {
  brain_dump_classification_id: string;
  capture_id: string;
  user_id: string;
  category: BrainDumpClassificationRecord["category"];
  status: BrainDumpClassificationRecord["status"];
  confirmed_at: Date;
  recorded_at: Date;
  ended_at: Date | null;
  supersedes_classification_id: string | null;
  request_id: string;
  request_fingerprint: string;
};

type NotNowRow = {
  not_now_item_id: string;
  root_id: string;
  revision: number;
  capture_id: string;
  brain_dump_classification_id: string;
  user_id: string;
  assessment: NotNowItemRecord["assessment"];
  posture: NotNowItemRecord["posture"];
  lifecycle_state: NotNowItemRecord["state"];
  status: NotNowItemRecord["status"];
  review_note: string | null;
  decided_at: Date;
  recorded_at: Date;
  ended_at: Date | null;
  supersedes_not_now_item_id: string | null;
  request_id: string;
  request_fingerprint: string;
};

function classificationFromRow(row: ClassificationRow): BrainDumpClassificationRecord {
  return {
    classificationId: row.brain_dump_classification_id,
    captureId: row.capture_id,
    userId: row.user_id,
    category: row.category,
    status: row.status,
    confirmedAt: iso(row.confirmed_at),
    recordedAt: iso(row.recorded_at),
    ...(row.ended_at ? { endedAt: iso(row.ended_at) } : {}),
    ...(row.supersedes_classification_id
      ? { supersedesClassificationId: row.supersedes_classification_id }
      : {}),
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
  };
}

function notNowFromRow(row: NotNowRow): NotNowItemRecord {
  return {
    itemId: row.not_now_item_id,
    rootId: row.root_id,
    revision: row.revision,
    captureId: row.capture_id,
    classificationId: row.brain_dump_classification_id,
    userId: row.user_id,
    assessment: row.assessment,
    posture: row.posture,
    state: row.lifecycle_state,
    status: row.status,
    ...(row.review_note ? { reviewNote: row.review_note } : {}),
    decidedAt: iso(row.decided_at),
    recordedAt: iso(row.recorded_at),
    ...(row.ended_at ? { endedAt: iso(row.ended_at) } : {}),
    ...(row.supersedes_not_now_item_id ? { supersedesItemId: row.supersedes_not_now_item_id } : {}),
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
  };
}

const classificationColumns = `
  brain_dump_classification_id, capture_id, user_id, category, status,
  confirmed_at, recorded_at, ended_at, supersedes_classification_id,
  request_id, request_fingerprint
`;

const notNowColumns = `
  not_now_item_id, root_id, revision, capture_id, brain_dump_classification_id,
  user_id, assessment, posture, lifecycle_state, status, review_note, decided_at,
  recorded_at, ended_at, supersedes_not_now_item_id, request_id, request_fingerprint
`;

class PostgresBrainDumpNotNowTransaction implements BrainDumpNotNowTransaction {
  constructor(private readonly client: PoolClient) {}

  async getCaptureForUpdate(captureId: string, userId: string) {
    const result = await this.client.query<CaptureRow>(
      `SELECT capture_id, user_id, raw_text, source, received_at, recorded_at
         FROM capture_record
        WHERE capture_id = $1 AND user_id = $2
        FOR UPDATE`,
      [captureId, userId],
    );
    const row = result.rows[0];
    return row ? {
      captureId: row.capture_id,
      userId: row.user_id,
      rawText: row.raw_text,
      source: row.source,
      receivedAt: iso(row.received_at),
      recordedAt: iso(row.recorded_at),
    } : undefined;
  }

  async findClassificationByRequestId(requestId: string, userId: string) {
    const result = await this.client.query<ClassificationRow>(
      `SELECT ${classificationColumns}
         FROM brain_dump_classification
        WHERE request_id = $1 AND user_id = $2
        FOR UPDATE`,
      [requestId, userId],
    );
    return result.rows[0] ? classificationFromRow(result.rows[0]) : undefined;
  }

  async getCurrentClassificationForUpdate(captureId: string, userId: string) {
    const result = await this.client.query<ClassificationRow>(
      `SELECT ${classificationColumns}
         FROM brain_dump_classification
        WHERE capture_id = $1 AND user_id = $2 AND status = 'CURRENT'
        FOR UPDATE`,
      [captureId, userId],
    );
    return result.rows[0] ? classificationFromRow(result.rows[0]) : undefined;
  }

  async supersedeCurrentClassification(classificationId: string, userId: string, endedAt: string) {
    const result = await this.client.query(
      `UPDATE brain_dump_classification
          SET status = 'SUPERSEDED', ended_at = $3
        WHERE brain_dump_classification_id = $1 AND user_id = $2 AND status = 'CURRENT'`,
      [classificationId, userId, endedAt],
    );
    if (result.rowCount !== 1) throw new Error("Brain Dump classification supersession conflict");
  }

  async createClassification(record: BrainDumpClassificationRecord) {
    await this.client.query(
      `INSERT INTO brain_dump_classification
        (brain_dump_classification_id, capture_id, user_id, category, status,
         confirmed_at, recorded_at, ended_at, supersedes_classification_id,
         request_id, request_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        record.classificationId,
        record.captureId,
        record.userId,
        record.category,
        record.status,
        record.confirmedAt,
        record.recordedAt,
        record.endedAt ?? null,
        record.supersedesClassificationId ?? null,
        record.requestId,
        record.requestFingerprint,
      ],
    );
  }

  async findNotNowItemByRequestId(requestId: string, userId: string) {
    const result = await this.client.query<NotNowRow>(
      `SELECT ${notNowColumns}
         FROM not_now_item
        WHERE request_id = $1 AND user_id = $2
        FOR UPDATE`,
      [requestId, userId],
    );
    return result.rows[0] ? notNowFromRow(result.rows[0]) : undefined;
  }

  async getCurrentNotNowItemForCapture(captureId: string, userId: string) {
    const result = await this.client.query<NotNowRow>(
      `SELECT ${notNowColumns}
         FROM not_now_item
        WHERE capture_id = $1 AND user_id = $2 AND status = 'CURRENT'
        FOR UPDATE`,
      [captureId, userId],
    );
    return result.rows[0] ? notNowFromRow(result.rows[0]) : undefined;
  }

  async getCurrentNotNowItemForUpdate(rootId: string, userId: string) {
    const result = await this.client.query<NotNowRow>(
      `SELECT ${notNowColumns}
         FROM not_now_item
        WHERE root_id = $1 AND user_id = $2 AND status = 'CURRENT'
        FOR UPDATE`,
      [rootId, userId],
    );
    return result.rows[0] ? notNowFromRow(result.rows[0]) : undefined;
  }

  async supersedeCurrentNotNowItem(itemId: string, userId: string, endedAt: string) {
    const result = await this.client.query(
      `UPDATE not_now_item
          SET status = 'SUPERSEDED', ended_at = $3
        WHERE not_now_item_id = $1 AND user_id = $2 AND status = 'CURRENT'`,
      [itemId, userId, endedAt],
    );
    if (result.rowCount !== 1) throw new Error("NOT NOW item supersession conflict");
  }

  async createNotNowItem(record: NotNowItemRecord) {
    await this.client.query(
      `INSERT INTO not_now_item
        (not_now_item_id, root_id, revision, capture_id, brain_dump_classification_id,
         user_id, assessment, posture, lifecycle_state, status, review_note,
         decided_at, recorded_at, ended_at, supersedes_not_now_item_id,
         request_id, request_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        record.itemId,
        record.rootId,
        record.revision,
        record.captureId,
        record.classificationId,
        record.userId,
        record.assessment,
        record.posture,
        record.state,
        record.status,
        record.reviewNote ?? null,
        record.decidedAt,
        record.recordedAt,
        record.endedAt ?? null,
        record.supersedesItemId ?? null,
        record.requestId,
        record.requestFingerprint,
      ],
    );
  }

  async appendDomainEvent(event: BrainDumpNotNowDomainEventRecord) {
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

export class PostgresBrainDumpNotNowUnitOfWork implements BrainDumpNotNowUnitOfWork {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  run<T>(
    authenticatedUserId: string,
    work: (transaction: BrainDumpNotNowTransaction) => Promise<T>,
  ): Promise<T> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`brain-dump-not-now:${authenticatedUserId}`],
      );
      return work(new PostgresBrainDumpNotNowTransaction(client));
    });
  }
}
