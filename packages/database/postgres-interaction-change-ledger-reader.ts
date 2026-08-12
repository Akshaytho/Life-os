import type { Pool } from "pg";
import type {
  AppliedProposalRecord,
  CaptureRecord,
  DomainEventRecord,
  RoutingInterpretationRecord,
  RoutingProposalRecord,
} from "../domain/write-boundary";
import type {
  InteractionChangeLedgerReader,
  PersistedInteractionChangeTrace,
  PersistedInteractionProposalTrace,
} from "../domain/interaction-change-ledger";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type TraceRow = {
  capture_id: string;
  user_id: string;
  raw_text: string;
  capture_source: CaptureRecord["source"];
  correlation_id: string;
  request_id: string;
  received_at: Date;
  capture_recorded_at: Date;

  interpretation_id: string | null;
  interpretation_version: number | null;
  interpreter: RoutingInterpretationRecord["interpreter"] | null;
  intent: RoutingInterpretationRecord["intent"] | null;
  certainty: RoutingInterpretationRecord["certainty"] | null;
  confidence: number | null;
  observations_json: RoutingInterpretationRecord["observations"] | null;
  clarification: string | null;
  interpretation_created_at: Date | null;

  proposal_id: string | null;
  interpreter_proposal_key: string | null;
  destination: RoutingProposalRecord["destination"] | null;
  operation: RoutingProposalRecord["operation"] | null;
  summary: string | null;
  target_trust_class: RoutingProposalRecord["targetTrustClass"] | null;
  approval_mode: RoutingProposalRecord["approvalMode"] | null;
  proposal_state: RoutingProposalRecord["state"] | null;
  reason: string | null;
  payload_json: Record<string, unknown> | null;
  proposal_created_at: Date | null;
  proposal_applied_at: Date | null;
  proposal_applied_entity_id: string | null;
  proposal_applied_event_id: string | null;

  marker_applied_at: Date | null;
  confirmed_by_actor_id: string | null;
  request_fingerprint: string | null;
  marker_entity_type: "calendar_event" | null;
  marker_entity_id: string | null;
  marker_event_id: string | null;

  event_id: string | null;
  event_user_id: string | null;
  event_occurred_at: Date | null;
  event_recorded_at: Date | null;
  event_actor_type: DomainEventRecord["actorType"] | null;
  event_actor_id: string | null;
  event_type: string | null;
  event_entity_type: string | null;
  event_entity_id: string | null;
  event_source: DomainEventRecord["source"] | null;
  event_correlation_id: string | null;
  event_causation_event_id: string | null;
  event_payload_json: Record<string, unknown> | null;
  event_schema_version: number | null;
};

function captureFrom(row: TraceRow): CaptureRecord {
  return {
    captureId: row.capture_id,
    userId: row.user_id,
    rawText: row.raw_text,
    source: row.capture_source,
    correlationId: row.correlation_id,
    requestId: row.request_id,
    receivedAt: iso(row.received_at),
    recordedAt: iso(row.capture_recorded_at),
  };
}

function interpretationFrom(row: TraceRow): RoutingInterpretationRecord | undefined {
  if (!row.interpretation_id) return undefined;
  if (
    row.interpretation_version !== 1 ||
    !row.interpreter ||
    !row.intent ||
    !row.certainty ||
    row.confidence === null ||
    !row.observations_json ||
    !row.interpretation_created_at
  ) {
    throw new Error(`Incomplete persisted interpretation ${row.interpretation_id}`);
  }

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
    createdAt: iso(row.interpretation_created_at),
  };
}

function proposalFrom(row: TraceRow): RoutingProposalRecord | undefined {
  if (!row.proposal_id) return undefined;
  if (
    !row.interpreter_proposal_key ||
    !row.destination ||
    !row.operation ||
    !row.summary ||
    !row.target_trust_class ||
    !row.approval_mode ||
    !row.proposal_state ||
    !row.reason ||
    !row.payload_json ||
    !row.proposal_created_at
  ) {
    throw new Error(`Incomplete persisted proposal ${row.proposal_id}`);
  }

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
    state: row.proposal_state,
    reason: row.reason,
    payloadJson: row.payload_json,
    createdAt: iso(row.proposal_created_at),
    appliedAt: row.proposal_applied_at ? iso(row.proposal_applied_at) : undefined,
    appliedEntityId: row.proposal_applied_entity_id ?? undefined,
    appliedEventId: row.proposal_applied_event_id ?? undefined,
  };
}

function appliedFrom(row: TraceRow): AppliedProposalRecord | undefined {
  if (!row.marker_applied_at) return undefined;
  if (
    !row.proposal_id ||
    !row.confirmed_by_actor_id ||
    !row.request_fingerprint ||
    !row.marker_entity_type ||
    !row.marker_entity_id ||
    !row.marker_event_id
  ) {
    throw new Error(`Incomplete applied-proposal provenance for ${row.proposal_id ?? "unknown proposal"}`);
  }

  return {
    proposalId: row.proposal_id,
    appliedAt: iso(row.marker_applied_at),
    confirmedByActorId: row.confirmed_by_actor_id,
    requestFingerprint: row.request_fingerprint,
    entityType: row.marker_entity_type,
    entityId: row.marker_entity_id,
    eventId: row.marker_event_id,
  };
}

function eventFrom(row: TraceRow): DomainEventRecord | undefined {
  if (!row.event_id) return undefined;
  if (
    !row.event_user_id ||
    !row.event_occurred_at ||
    !row.event_recorded_at ||
    !row.event_actor_type ||
    !row.event_type ||
    !row.event_entity_type ||
    !row.event_entity_id ||
    !row.event_source ||
    !row.event_correlation_id ||
    !row.event_payload_json ||
    row.event_schema_version !== 1
  ) {
    throw new Error(`Incomplete domain event provenance for ${row.event_id}`);
  }

  if (row.event_type !== "CALENDAR_EVENT_CREATED" || row.event_entity_type !== "calendar_event") {
    throw new Error(`Unsupported V1 interaction-ledger event ${row.event_type}/${row.event_entity_type}`);
  }

  return {
    eventId: row.event_id,
    userId: row.event_user_id,
    occurredAt: iso(row.event_occurred_at),
    recordedAt: iso(row.event_recorded_at),
    actorType: row.event_actor_type,
    actorId: row.event_actor_id ?? undefined,
    eventType: "CALENDAR_EVENT_CREATED",
    entityType: "calendar_event",
    entityId: row.event_entity_id,
    source: row.event_source,
    correlationId: row.event_correlation_id,
    causationEventId: row.event_causation_event_id ?? undefined,
    payloadJson: row.event_payload_json,
    schemaVersion: 1,
  };
}

export class PostgresInteractionChangeLedgerReader implements InteractionChangeLedgerReader {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  async getTrace(captureId: string, authenticatedUserId: string): Promise<PersistedInteractionChangeTrace | undefined> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<TraceRow>(
        `SELECT
           c.capture_id,
           c.user_id,
           c.raw_text,
           c.source AS capture_source,
           c.correlation_id,
           c.request_id,
           c.received_at,
           c.recorded_at AS capture_recorded_at,

           ri.interpretation_id,
           ri.version AS interpretation_version,
           ri.interpreter,
           ri.intent,
           ri.certainty,
           ri.confidence,
           ri.observations_json,
           ri.clarification,
           ri.created_at AS interpretation_created_at,

           rp.proposal_id,
           rp.interpreter_proposal_key,
           rp.destination,
           rp.operation,
           rp.summary,
           rp.target_trust_class,
           rp.approval_mode,
           rp.state AS proposal_state,
           rp.reason,
           rp.payload_json,
           rp.created_at AS proposal_created_at,
           rp.applied_at AS proposal_applied_at,
           rp.applied_entity_id AS proposal_applied_entity_id,
           rp.applied_event_id AS proposal_applied_event_id,

           ap.applied_at AS marker_applied_at,
           ap.confirmed_by_actor_id,
           ap.request_fingerprint,
           ap.entity_type AS marker_entity_type,
           ap.entity_id AS marker_entity_id,
           ap.event_id AS marker_event_id,

           de.event_id,
           de.user_id AS event_user_id,
           de.occurred_at AS event_occurred_at,
           de.recorded_at AS event_recorded_at,
           de.actor_type AS event_actor_type,
           de.actor_id AS event_actor_id,
           de.event_type,
           de.entity_type AS event_entity_type,
           de.entity_id AS event_entity_id,
           de.source AS event_source,
           de.correlation_id AS event_correlation_id,
           de.causation_event_id AS event_causation_event_id,
           de.payload_json AS event_payload_json,
           de.schema_version AS event_schema_version
         FROM capture_record c
         LEFT JOIN routing_interpretation ri
           ON ri.capture_id = c.capture_id
          AND ri.user_id = c.user_id
          AND ri.version = 1
         LEFT JOIN routing_proposal rp
           ON rp.interpretation_id = ri.interpretation_id
          AND rp.capture_id = c.capture_id
          AND rp.user_id = c.user_id
         LEFT JOIN applied_proposal ap
           ON ap.proposal_id = rp.proposal_id
         LEFT JOIN domain_event de
           ON de.event_id = ap.event_id
          AND de.user_id = c.user_id
         WHERE c.capture_id = $1
           AND c.user_id = $2
         ORDER BY rp.created_at NULLS LAST, rp.proposal_id NULLS LAST`,
        [captureId, authenticatedUserId],
      );

      const first = result.rows[0];
      if (!first) return undefined;

      const interpretation = interpretationFrom(first);
      const proposals: PersistedInteractionProposalTrace[] = [];
      for (const row of result.rows) {
        const proposal = proposalFrom(row);
        if (!proposal) continue;
        proposals.push({
          proposal,
          applied: appliedFrom(row),
          event: eventFrom(row),
        });
      }

      return {
        capture: captureFrom(first),
        interpretation,
        proposals,
      };
    });
  }
}
