import type { Pool, PoolClient } from "pg";
import type {
  JourneyCapabilityDecisionRecord,
  JourneyPracticeCompletionRecord,
  JourneyPracticeDomainEventRecord,
  JourneyPracticeSessionRecord,
  JourneyPracticeTransaction,
  JourneyPracticeUnitOfWork,
} from "../domain/journey-practice";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export type JourneyActivationRow = {
  journey_decision_id: string;
  user_id: string;
  journey_code: JourneyCapabilityDecisionRecord["journeyCode"];
  capability_code: JourneyCapabilityDecisionRecord["capabilityCode"];
  starting_technique: JourneyCapabilityDecisionRecord["startingTechnique"];
  decision_reason: string | null;
  source: JourneyCapabilityDecisionRecord["source"];
  correlation_id: string;
  request_id: string;
  request_fingerprint: string;
  decided_at: Date;
  recorded_at: Date;
};

export type JourneySessionRow = {
  practice_session_id: string;
  user_id: string;
  journey_decision_id: string;
  technique: JourneyPracticeSessionRecord["technique"];
  experiment_intention: string | null;
  source: JourneyPracticeSessionRecord["source"];
  correlation_id: string;
  request_id: string;
  request_fingerprint: string;
  started_at: Date;
  recorded_at: Date;
};

export type JourneyCompletionRow = {
  practice_completion_id: string;
  practice_session_id: string;
  user_id: string;
  reflection_note: string | null;
  retained_learning_candidate: string | null;
  source: JourneyPracticeCompletionRecord["source"];
  correlation_id: string;
  request_id: string;
  request_fingerprint: string;
  completed_at: Date;
  recorded_at: Date;
};

export function journeyActivationFromRow(row: JourneyActivationRow): JourneyCapabilityDecisionRecord {
  return {
    decisionId: row.journey_decision_id,
    userId: row.user_id,
    journeyCode: row.journey_code,
    capabilityCode: row.capability_code,
    startingTechnique: row.starting_technique,
    ...(row.decision_reason ? { decisionReason: row.decision_reason } : {}),
    source: row.source,
    correlationId: row.correlation_id,
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
    decidedAt: iso(row.decided_at),
    recordedAt: iso(row.recorded_at),
  };
}

export function journeySessionFromRow(row: JourneySessionRow): JourneyPracticeSessionRecord {
  return {
    sessionId: row.practice_session_id,
    userId: row.user_id,
    decisionId: row.journey_decision_id,
    technique: row.technique,
    ...(row.experiment_intention ? { experimentIntention: row.experiment_intention } : {}),
    source: row.source,
    correlationId: row.correlation_id,
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
    startedAt: iso(row.started_at),
    recordedAt: iso(row.recorded_at),
  };
}

export function journeyCompletionFromRow(row: JourneyCompletionRow): JourneyPracticeCompletionRecord {
  return {
    completionId: row.practice_completion_id,
    sessionId: row.practice_session_id,
    userId: row.user_id,
    ...(row.reflection_note ? { reflectionNote: row.reflection_note } : {}),
    ...(row.retained_learning_candidate
      ? { retainedLearningCandidate: row.retained_learning_candidate }
      : {}),
    source: row.source,
    correlationId: row.correlation_id,
    requestId: row.request_id,
    requestFingerprint: row.request_fingerprint,
    completedAt: iso(row.completed_at),
    recordedAt: iso(row.recorded_at),
  };
}

const activationColumns = `
  journey_decision_id, user_id, journey_code, capability_code, starting_technique,
  decision_reason, source, correlation_id, request_id, request_fingerprint,
  decided_at, recorded_at
`;
const sessionColumns = `
  practice_session_id, user_id, journey_decision_id, technique, experiment_intention,
  source, correlation_id, request_id, request_fingerprint, started_at, recorded_at
`;
const completionColumns = `
  practice_completion_id, practice_session_id, user_id, reflection_note,
  retained_learning_candidate, source, correlation_id, request_id,
  request_fingerprint, completed_at, recorded_at
`;

class PostgresJourneyPracticeTransaction implements JourneyPracticeTransaction {
  constructor(private readonly client: PoolClient) {}

  async findActivationByRequestId(requestId: string, userId: string) {
    const result = await this.client.query<JourneyActivationRow>(
      `SELECT ${activationColumns} FROM journey_capability_decision
        WHERE request_id = $1 AND user_id = $2`,
      [requestId, userId],
    );
    return result.rows[0] ? journeyActivationFromRow(result.rows[0]) : undefined;
  }

  async getCurrentActivation(userId: string) {
    const result = await this.client.query<JourneyActivationRow>(
      `SELECT ${activationColumns} FROM journey_capability_decision WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ? journeyActivationFromRow(result.rows[0]) : undefined;
  }

  async createActivation(record: JourneyCapabilityDecisionRecord) {
    await this.client.query(
      `INSERT INTO journey_capability_decision
        (journey_decision_id, user_id, journey_code, capability_code,
         starting_technique, decision_reason, authority_class, source,
         correlation_id, request_id, request_fingerprint, decided_at, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'DECISION', $7, $8, $9, $10, $11, $12)`,
      [
        record.decisionId, record.userId, record.journeyCode, record.capabilityCode,
        record.startingTechnique, record.decisionReason ?? null, record.source,
        record.correlationId, record.requestId, record.requestFingerprint,
        record.decidedAt, record.recordedAt,
      ],
    );
  }

  async findSessionByRequestId(requestId: string, userId: string) {
    const result = await this.client.query<JourneySessionRow>(
      `SELECT ${sessionColumns} FROM journey_practice_session
        WHERE request_id = $1 AND user_id = $2`,
      [requestId, userId],
    );
    return result.rows[0] ? journeySessionFromRow(result.rows[0]) : undefined;
  }

  async getOpenSession(userId: string) {
    const result = await this.client.query<JourneySessionRow>(
      `SELECT ${sessionColumns}
         FROM journey_practice_session session
        WHERE session.user_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM journey_practice_completion completion
             WHERE completion.practice_session_id = session.practice_session_id
               AND completion.user_id = session.user_id
          )
        ORDER BY session.started_at DESC, session.practice_session_id DESC
        LIMIT 1`,
      [userId],
    );
    return result.rows[0] ? journeySessionFromRow(result.rows[0]) : undefined;
  }

  async getSession(sessionId: string, userId: string) {
    const result = await this.client.query<JourneySessionRow>(
      `SELECT ${sessionColumns} FROM journey_practice_session
        WHERE practice_session_id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    return result.rows[0] ? journeySessionFromRow(result.rows[0]) : undefined;
  }

  async createSession(record: JourneyPracticeSessionRecord) {
    await this.client.query(
      `INSERT INTO journey_practice_session
        (practice_session_id, user_id, journey_decision_id, technique,
         experiment_intention, source, correlation_id, request_id,
         request_fingerprint, started_at, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        record.sessionId, record.userId, record.decisionId, record.technique,
        record.experimentIntention ?? null, record.source, record.correlationId,
        record.requestId, record.requestFingerprint, record.startedAt, record.recordedAt,
      ],
    );
  }

  async findCompletionByRequestId(requestId: string, userId: string) {
    const result = await this.client.query<JourneyCompletionRow>(
      `SELECT ${completionColumns} FROM journey_practice_completion
        WHERE request_id = $1 AND user_id = $2`,
      [requestId, userId],
    );
    return result.rows[0] ? journeyCompletionFromRow(result.rows[0]) : undefined;
  }

  async getCompletion(sessionId: string, userId: string) {
    const result = await this.client.query<JourneyCompletionRow>(
      `SELECT ${completionColumns} FROM journey_practice_completion
        WHERE practice_session_id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    return result.rows[0] ? journeyCompletionFromRow(result.rows[0]) : undefined;
  }

  async createCompletion(record: JourneyPracticeCompletionRecord) {
    await this.client.query(
      `INSERT INTO journey_practice_completion
        (practice_completion_id, practice_session_id, user_id, reflection_note,
         retained_learning_candidate, reflection_authority_class, source,
         correlation_id, request_id, request_fingerprint, completed_at, recorded_at)
       VALUES ($1, $2, $3, $4, $5, 'REFLECTION', $6, $7, $8, $9, $10, $11)`,
      [
        record.completionId, record.sessionId, record.userId, record.reflectionNote ?? null,
        record.retainedLearningCandidate ?? null, record.source, record.correlationId,
        record.requestId, record.requestFingerprint, record.completedAt, record.recordedAt,
      ],
    );
  }

  async appendDomainEvent(event: JourneyPracticeDomainEventRecord) {
    await this.client.query(
      `INSERT INTO domain_event
        (event_id, user_id, occurred_at, recorded_at, actor_type, actor_id, event_type,
         entity_type, entity_id, source, correlation_id, causation_event_id,
         payload_json, schema_version)
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

export class PostgresJourneyPracticeUnitOfWork implements JourneyPracticeUnitOfWork {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  run<T>(
    authenticatedUserId: string,
    work: (transaction: JourneyPracticeTransaction) => Promise<T>,
  ): Promise<T> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`journey-practice:${authenticatedUserId}`],
      );
      return work(new PostgresJourneyPracticeTransaction(client));
    });
  }
}
