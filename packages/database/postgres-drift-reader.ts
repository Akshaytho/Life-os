import type { Pool } from "pg";
import type { DriftDecisionRecord, DriftOccurrenceRecord } from "../domain/drift-return";
import type { DriftOccurrenceWithDecisions, DriftReader } from "../domain/drift-return-read";
import { driftDecisionFromRow } from "./postgres-drift-unit-of-work";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class PostgresDriftReader implements DriftReader {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  async listCurrent(authenticatedUserId: string, limit: number): Promise<DriftOccurrenceWithDecisions[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 101) {
      throw new Error("Drift read limit must be an integer between 1 and 101");
    }

    return this.userScope.run(authenticatedUserId, async (client) => {
      const occurrences = await client.query<{
        drift_id: string;
        user_id: string;
        source_note: string | null;
        source: DriftOccurrenceRecord["source"];
        correlation_id: string;
        request_id: string;
        request_fingerprint: string;
        occurred_at: Date;
        recorded_at: Date;
      }>(
        `SELECT drift_id, user_id, source_note, source, correlation_id, request_id,
                request_fingerprint, occurred_at, recorded_at
           FROM drift_occurrence
          WHERE user_id = $1
          ORDER BY occurred_at DESC, drift_id DESC
          LIMIT $2`,
        [authenticatedUserId, limit],
      );

      const driftIds = occurrences.rows.map((row) => row.drift_id);
      if (driftIds.length === 0) return [];

      const decisions = await client.query<Parameters<typeof driftDecisionFromRow>[0]>(
        `SELECT drift_decision_id, root_decision_id, revision, drift_id, user_id,
                explanation, trigger_note, emotion_note, distraction_note, return_posture,
                lifecycle_state, status, decided_at, recorded_at, ended_at,
                supersedes_drift_decision_id, request_id, request_fingerprint
           FROM drift_decision
          WHERE user_id = $1 AND drift_id = ANY($2::text[])
          ORDER BY drift_id, revision DESC`,
        [authenticatedUserId, driftIds],
      );

      const byDrift = new Map<string, DriftDecisionRecord[]>();
      for (const row of decisions.rows) {
        const decision = driftDecisionFromRow(row);
        const existing = byDrift.get(decision.driftId) ?? [];
        existing.push(decision);
        byDrift.set(decision.driftId, existing);
      }

      return occurrences.rows.map((row) => ({
        occurrence: {
          driftId: row.drift_id,
          userId: row.user_id,
          ...(row.source_note ? { sourceNote: row.source_note } : {}),
          source: row.source,
          correlationId: row.correlation_id,
          requestId: row.request_id,
          requestFingerprint: row.request_fingerprint,
          occurredAt: iso(row.occurred_at),
          recordedAt: iso(row.recorded_at),
        },
        decisions: byDrift.get(row.drift_id) ?? [],
      }));
    });
  }
}
