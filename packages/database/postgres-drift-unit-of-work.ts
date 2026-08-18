import type { Pool, PoolClient } from "pg";
import type {
  DriftDecisionRecord,
  DriftDomainEventRecord,
  DriftOccurrenceRecord,
  DriftTransaction,
  DriftUnitOfWork,
} from "../domain/drift-return";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type OccurrenceRow = {
  drift_id: string;
  user_id: string;
  source_note: string | null;
  source: DriftOccurrenceRecord["source"];
  correlation_id: string;
  request_id: string;
  request_fingerprint: string;
  occurred_at: Date;
  recorded_at: Date;
};

type DecisionRow = {
  drift_decision_id: string;
  root_decision_id: string;
  revision: number;
  drift_id: string;
  user_id: string;
  explanation: DriftDecisionRecord["explanation"];
  trigger_note: string | null;
  emotion_note: string | null;
  distraction_note: string | null;
  return_posture: DriftDecisionRecord["returnPosture"] | null;
  lifecycle_state: DriftDecisionRecord["lifecycleState"];
  status: DriftDecisionRecord["status"];
  decided_at: Date;
  recorded_at: Date;
  ended_at: Date | null;
  supersedes_drift_decision_id: string | null;
  request_id: string;
  request_fingerprint: string;
};

const occurrenceColumns = `
  drift_id, user_id, source_note, source, correlation_id, request_id,
  request_fingerprint, occurred_at, recorded_at
`;

const decisionColumns = `
  drift_decision_id, root_decision_id, revision, drift_id, user_id,
  explanation, trigger_note, emotion_note, distraction_note, return_posture,
  lifecycle_state, status, decided_at, recorded_at, ended_at,
  supersedes_drift_decision_id, request_id, request_fingerprint
`;

function occurrenceFromRow(row: OccurrenceRow): DriftOccurrenceRecord {
  return {
    driftId: row.drift_id,
    userId: row.user_id,
    ...(row.source_note ? { sourceNote: row.source_note } : {}),
    source: row.source,
    correlationId: row.correlation_id,
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
    occurredAt: iso(row.occurred_at),
    recordedAt: iso(row.recorded_at),
  };
}

export function driftDecisionFromRow(row: DecisionRow): DriftDecisionRecord {
  return {
    decisionId: row.drift_decision_id,
    rootDecisionId: row.root_decision_id,
    revision: row.revision,
    driftId: row.drift_id,
    userId: row.user_id,
    explanation: row.explanation,
    ...(row.trigger_note ? { triggerNote: row.trigger_note } : {}),
    ...(row.emotion_note ? { emotionNote: row.emotion_note } : {}),
    ...(row.distraction_note ? { distractionNote: row.distraction_note } : {}),
    ...(row.return_posture ? { returnPosture: row.return_posture } : {}),
    lifecycleState: row.lifecycle_state,
    status: row.status,
    decidedAt: iso(row.decided_at),
    recordedAt: iso(row.recorded_at),
    ...(row.ended_at ? { endedAt: iso(row.ended_at) } : {}),
    ...(row.supersedes_drift_decision_id
      ? { supersedesDecisionId: row.supersedes_drift_decision_id }
      : {}),
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
  };
}

class PostgresDriftTransaction implements DriftTransaction {
  constructor(private readonly client: PoolClient) {}

  async findOccurrenceByRequestId(requestId: string, userId: string) {
    const result = await this.client.query<OccurrenceRow>(
      `SELECT ${occurrenceColumns}
         FROM drift_occurrence
        WHERE request_id = $1 AND user_id = $2
        FOR UPDATE`,
      [requestId, userId],
    );
    return result.rows[0] ? occurrenceFromRow(result.rows[0]) : undefined;
  }

  async getOccurrenceForUpdate(driftId: string, userId: string) {
    const result = await this.client.query<OccurrenceRow>(
      `SELECT ${occurrenceColumns}
         FROM drift_occurrence
        WHERE drift_id = $1 AND user_id = $2
        FOR UPDATE`,
      [driftId, userId],
    );
    return result.rows[0] ? occurrenceFromRow(result.rows[0]) : undefined;
  }

  async createOccurrence(record: DriftOccurrenceRecord) {
    await this.client.query(
      `INSERT INTO drift_occurrence
        (drift_id, user_id, source_note, source, correlation_id, request_id,
         request_fingerprint, occurred_at, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.driftId,
        record.userId,
        record.sourceNote ?? null,
        record.source,
        record.correlationId,
        record.requestId,
        record.requestFingerprint,
        record.occurredAt,
        record.recordedAt,
      ],
    );
  }

  async findDecisionByRequestId(requestId: string, userId: string) {
    const result = await this.client.query<DecisionRow>(
      `SELECT ${decisionColumns}
         FROM drift_decision
        WHERE request_id = $1 AND user_id = $2
        FOR UPDATE`,
      [requestId, userId],
    );
    return result.rows[0] ? driftDecisionFromRow(result.rows[0]) : undefined;
  }

  async getCurrentDecisionForUpdate(driftId: string, userId: string) {
    const result = await this.client.query<DecisionRow>(
      `SELECT ${decisionColumns}
         FROM drift_decision
        WHERE drift_id = $1 AND user_id = $2 AND status = 'CURRENT'
        FOR UPDATE`,
      [driftId, userId],
    );
    return result.rows[0] ? driftDecisionFromRow(result.rows[0]) : undefined;
  }

  async supersedeCurrentDecision(decisionId: string, userId: string, endedAt: string) {
    const result = await this.client.query(
      `UPDATE drift_decision
          SET status = 'SUPERSEDED', ended_at = $3
        WHERE drift_decision_id = $1 AND user_id = $2 AND status = 'CURRENT'`,
      [decisionId, userId, endedAt],
    );
    if (result.rowCount !== 1) throw new Error("Drift decision supersession conflict");
  }

  async createDecision(record: DriftDecisionRecord) {
    await this.client.query(
      `INSERT INTO drift_decision
        (drift_decision_id, root_decision_id, revision, drift_id, user_id,
         explanation, trigger_note, emotion_note, distraction_note, return_posture,
         lifecycle_state, status, authority_class, decided_at, recorded_at, ended_at,
         supersedes_drift_decision_id, request_id, request_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               'DECISION', $13, $14, $15, $16, $17, $18)`,
      [
        record.decisionId,
        record.rootDecisionId,
        record.revision,
        record.driftId,
        record.userId,
        record.explanation,
        record.triggerNote ?? null,
        record.emotionNote ?? null,
        record.distractionNote ?? null,
        record.returnPosture ?? null,
        record.lifecycleState,
        record.status,
        record.decidedAt,
        record.recordedAt,
        record.endedAt ?? null,
        record.supersedesDecisionId ?? null,
        record.requestId,
        record.requestFingerprint,
      ],
    );
  }

  async appendDomainEvent(event: DriftDomainEventRecord) {
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

export class PostgresDriftUnitOfWork implements DriftUnitOfWork {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  run<T>(authenticatedUserId: string, work: (transaction: DriftTransaction) => Promise<T>): Promise<T> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`drift-return:${authenticatedUserId}`],
      );
      return work(new PostgresDriftTransaction(client));
    });
  }
}
