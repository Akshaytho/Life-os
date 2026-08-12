import type { Pool, PoolClient } from "pg";
import type {
  AppliedProposalRecord,
  CalendarPlanInput,
  CalendarPlanRecord,
  CaptureRecord,
  DomainEventRecord,
  ProposalRejectionRecord,
  RoutingInterpretationRecord,
  RoutingPersistenceBundle,
  RoutingProposalRecord,
  StoredCalendarProposal,
  WriteTransaction,
  WriteUnitOfWork,
} from "../domain/write-boundary";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type CaptureRow = {
  capture_id: string;
  user_id: string;
  raw_text: string;
  source: CaptureRecord["source"];
  correlation_id: string;
  request_id: string;
  received_at: Date;
  recorded_at: Date;
};

type InterpretationRow = {
  interpretation_id: string;
  capture_id: string;
  user_id: string;
  version: number;
  interpreter: RoutingInterpretationRecord["interpreter"];
  intent: RoutingInterpretationRecord["intent"];
  certainty: RoutingInterpretationRecord["certainty"];
  confidence: number;
  observations_json: RoutingInterpretationRecord["observations"];
  clarification: string | null;
  created_at: Date;
};

type ProposalRow = {
  proposal_id: string;
  interpreter_proposal_key: string;
  user_id: string;
  capture_id: string;
  interpretation_id: string | null;
  destination: RoutingProposalRecord["destination"];
  operation: RoutingProposalRecord["operation"];
  summary: string;
  target_trust_class: RoutingProposalRecord["targetTrustClass"];
  approval_mode: RoutingProposalRecord["approvalMode"];
  state: RoutingProposalRecord["state"];
  reason: string;
  payload_json: Record<string, unknown>;
  created_at: Date;
  applied_at: Date | null;
  applied_entity_id: string | null;
  applied_event_id: string | null;
};

function captureFromRow(row: CaptureRow): CaptureRecord {
  return {
    captureId: row.capture_id,
    userId: row.user_id,
    rawText: row.raw_text,
    source: row.source,
    correlationId: row.correlation_id,
    requestId: row.request_id,
    receivedAt: iso(row.received_at),
    recordedAt: iso(row.recorded_at),
  };
}

function interpretationFromRow(row: InterpretationRow): RoutingInterpretationRecord {
  if (row.version !== 1) throw new Error(`Unsupported routing interpretation version ${row.version}`);
  return {
    interpretationId: row.interpretation_id,
    captureId: row.capture_id,
    userId: row.user_id,
    version: 1,
    interpreter: row.interpreter,
    intent: row.intent,
    certainty: row.certainty,
    confidence: row.confidence,
    observations: row.observations_json,
    clarification: row.clarification ?? undefined,
    createdAt: iso(row.created_at),
  };
}

function proposalFromRow(row: ProposalRow): RoutingProposalRecord {
  return {
    proposalId: row.proposal_id,
    interpreterProposalKey: row.interpreter_proposal_key,
    userId: row.user_id,
    captureId: row.capture_id,
    interpretationId: row.interpretation_id ?? undefined,
    destination: row.destination,
    operation: row.operation,
    summary: row.summary,
    targetTrustClass: row.target_trust_class,
    approvalMode: row.approval_mode,
    state: row.state,
    reason: row.reason,
    payloadJson: row.payload_json,
    createdAt: iso(row.created_at),
    appliedAt: row.applied_at ? iso(row.applied_at) : undefined,
    appliedEntityId: row.applied_entity_id ?? undefined,
    appliedEventId: row.applied_event_id ?? undefined,
  };
}

function transactionFor(client: PoolClient): WriteTransaction {
  return {
    async getOrCreateCaptureRecord(record) {
      await client.query(
        `INSERT INTO capture_record
          (capture_id, user_id, raw_text, source, correlation_id, request_id, received_at, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, request_id) DO NOTHING`,
        [record.captureId, record.userId, record.rawText, record.source, record.correlationId,
          record.requestId, record.receivedAt, record.recordedAt],
      );

      const result = await client.query<CaptureRow>(
        `SELECT capture_id, user_id, raw_text, source, correlation_id, request_id, received_at, recorded_at
           FROM capture_record
          WHERE user_id = $1 AND request_id = $2`,
        [record.userId, record.requestId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Capture persistence did not return the requested record");
      return captureFromRow(row);
    },

    async lockCaptureForRouting(captureId, userId) {
      const result = await client.query(
        `SELECT capture_id
           FROM capture_record
          WHERE capture_id = $1 AND user_id = $2
          FOR UPDATE`,
        [captureId, userId],
      );
      return result.rowCount === 1;
    },

    async getRoutingBundleForCapture(captureId, userId): Promise<RoutingPersistenceBundle | undefined> {
      const interpretationResult = await client.query<InterpretationRow>(
        `SELECT interpretation_id, capture_id, user_id, version, interpreter, intent, certainty,
                confidence, observations_json, clarification, created_at
           FROM routing_interpretation
          WHERE capture_id = $1 AND user_id = $2 AND version = 1`,
        [captureId, userId],
      );
      const interpretationRow = interpretationResult.rows[0];
      if (!interpretationRow) return undefined;

      const proposalResult = await client.query<ProposalRow>(
        `SELECT proposal_id, interpreter_proposal_key, user_id, capture_id, interpretation_id,
                destination, operation, summary, target_trust_class, approval_mode, state,
                reason, payload_json, created_at, applied_at, applied_entity_id, applied_event_id
           FROM routing_proposal
          WHERE interpretation_id = $1 AND user_id = $2
          ORDER BY created_at, proposal_id`,
        [interpretationRow.interpretation_id, userId],
      );

      return {
        interpretation: interpretationFromRow(interpretationRow),
        proposals: proposalResult.rows.map(proposalFromRow),
      };
    },

    async createRoutingInterpretation(record) {
      await client.query(
        `INSERT INTO routing_interpretation
          (interpretation_id, capture_id, user_id, version, interpreter, intent, certainty,
           confidence, observations_json, clarification, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
        [record.interpretationId, record.captureId, record.userId, record.version, record.interpreter,
          record.intent, record.certainty, record.confidence, JSON.stringify(record.observations),
          record.clarification ?? null, record.createdAt],
      );
    },

    async createRoutingProposal(record) {
      await client.query(
        `INSERT INTO routing_proposal
          (proposal_id, interpreter_proposal_key, user_id, capture_id, interpretation_id,
           destination, operation, summary, target_trust_class, approval_mode, state,
           reason, payload_json, created_at, applied_at, applied_entity_id, applied_event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17)`,
        [record.proposalId, record.interpreterProposalKey, record.userId, record.captureId,
          record.interpretationId ?? null, record.destination, record.operation, record.summary,
          record.targetTrustClass, record.approvalMode, record.state, record.reason,
          JSON.stringify(record.payloadJson), record.createdAt, record.appliedAt ?? null,
          record.appliedEntityId ?? null, record.appliedEventId ?? null],
      );
    },

    async getRoutingProposalForUpdate(proposalId, userId) {
      const result = await client.query<ProposalRow>(
        `SELECT proposal_id, interpreter_proposal_key, user_id, capture_id, interpretation_id,
                destination, operation, summary, target_trust_class, approval_mode, state,
                reason, payload_json, created_at, applied_at, applied_entity_id, applied_event_id
           FROM routing_proposal
          WHERE proposal_id = $1 AND user_id = $2
          FOR UPDATE`,
        [proposalId, userId],
      );
      const row = result.rows[0];
      return row ? proposalFromRow(row) : undefined;
    },

    async findProposalRejection(proposalId) {
      const result = await client.query<{
        proposal_id: string;
        user_id: string;
        rejected_at: Date;
        rejected_by_actor_id: string;
        reason: string | null;
      }>(
        `SELECT proposal_id, user_id, rejected_at, rejected_by_actor_id, reason
           FROM proposal_rejection
          WHERE proposal_id = $1`,
        [proposalId],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        proposalId: row.proposal_id,
        userId: row.user_id,
        rejectedAt: iso(row.rejected_at),
        rejectedByActorId: row.rejected_by_actor_id,
        reason: row.reason ?? undefined,
      } satisfies ProposalRejectionRecord;
    },

    async createProposalRejection(record) {
      await client.query(
        `INSERT INTO proposal_rejection
          (proposal_id, user_id, rejected_at, rejected_by_actor_id, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [record.proposalId, record.userId, record.rejectedAt, record.rejectedByActorId, record.reason ?? null],
      );
    },

    async markRoutingProposalRejected(proposalId, userId) {
      const result = await client.query(
        `UPDATE routing_proposal
            SET state = 'REJECTED'
          WHERE proposal_id = $1
            AND user_id = $2
            AND state IN ('PROPOSED', 'NEEDS_CONFIRMATION', 'READY_TO_APPLY')`,
        [proposalId, userId],
      );
      if (result.rowCount !== 1) throw new Error(`Stored proposal ${proposalId} was not rejectable`);
    },

    async getStoredCalendarProposalForUpdate(proposalId, userId) {
      const result = await client.query<{
        proposal_id: string; user_id: string; capture_id: string; raw_text: string; correlation_id: string;
        destination: "CALENDAR"; operation: "CREATE_CALENDAR_PLAN";
        approval_mode: StoredCalendarProposal["approvalMode"]; state: StoredCalendarProposal["state"];
        payload_json: CalendarPlanInput; created_at: Date; applied_at: Date | null;
        applied_entity_id: string | null; applied_event_id: string | null;
      }>(
        `SELECT rp.proposal_id, rp.user_id, rp.capture_id, c.raw_text, c.correlation_id,
                rp.destination, rp.operation, rp.approval_mode, rp.state, rp.payload_json,
                rp.created_at, rp.applied_at, rp.applied_entity_id, rp.applied_event_id
           FROM routing_proposal rp
           JOIN capture_record c
             ON c.capture_id = rp.capture_id AND c.user_id = rp.user_id
          WHERE rp.proposal_id = $1
            AND rp.user_id = $2
            AND rp.destination = 'CALENDAR'
            AND rp.operation = 'CREATE_CALENDAR_PLAN'
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
        proposal_id: string; applied_at: Date; confirmed_by_actor_id: string; request_fingerprint: string;
        entity_type: "calendar_event"; entity_id: string; event_id: string;
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
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  async run<T>(authenticatedUserId: string, work: (transaction: WriteTransaction) => Promise<T>): Promise<T> {
    return this.userScope.run(authenticatedUserId, async (client) => work(transactionFor(client)));
  }
}
