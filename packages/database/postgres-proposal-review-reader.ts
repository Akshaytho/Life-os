import type { Pool } from "pg";
import type {
  CaptureRecord,
  RoutingInterpretationRecord,
  RoutingProposalRecord,
} from "../domain/write-boundary";
import type {
  PersistedCaptureProposalReview,
  ProposalReviewReader,
} from "../domain/proposal-review";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type ReviewRow = {
  capture_id: string;
  user_id: string;
  raw_text: string;
  source: CaptureRecord["source"];
  correlation_id: string;
  request_id: string;
  received_at: Date;
  recorded_at: Date;

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
  applied_at: Date | null;
  applied_entity_id: string | null;
  applied_event_id: string | null;
};

function captureFrom(row: ReviewRow): CaptureRecord {
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

function interpretationFrom(row: ReviewRow): RoutingInterpretationRecord | undefined {
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

function proposalFrom(row: ReviewRow): RoutingProposalRecord | undefined {
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
    appliedAt: row.applied_at ? iso(row.applied_at) : undefined,
    appliedEntityId: row.applied_entity_id ?? undefined,
    appliedEventId: row.applied_event_id ?? undefined,
  };
}

export class PostgresProposalReviewReader implements ProposalReviewReader {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  async getCaptureReview(captureId: string, authenticatedUserId: string): Promise<PersistedCaptureProposalReview | undefined> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<ReviewRow>(
        `SELECT
           c.capture_id,
           c.user_id,
           c.raw_text,
           c.source,
           c.correlation_id,
           c.request_id,
           c.received_at,
           c.recorded_at,

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
           rp.applied_at,
           rp.applied_entity_id,
           rp.applied_event_id
         FROM capture_record c
         LEFT JOIN routing_interpretation ri
           ON ri.capture_id = c.capture_id
          AND ri.user_id = c.user_id
          AND ri.version = 1
         LEFT JOIN routing_proposal rp
           ON rp.interpretation_id = ri.interpretation_id
          AND rp.capture_id = c.capture_id
          AND rp.user_id = c.user_id
         WHERE c.capture_id = $1
           AND c.user_id = $2
         ORDER BY rp.created_at NULLS LAST, rp.proposal_id NULLS LAST`,
        [captureId, authenticatedUserId],
      );

      const first = result.rows[0];
      if (!first) return undefined;

      const interpretation = interpretationFrom(first);
      const proposals = result.rows
        .map(proposalFrom)
        .filter((value): value is RoutingProposalRecord => Boolean(value));

      return {
        capture: captureFrom(first),
        interpretation,
        proposals,
      };
    });
  }
}
