import type { Pool } from "pg";
import type {
  JourneyPracticeReadSnapshot,
  JourneyPracticeReader,
} from "../domain/journey-practice-read";
import {
  journeyActivationFromRow,
  journeyCompletionFromRow,
  journeySessionFromRow,
  type JourneyActivationRow,
  type JourneyCompletionRow,
  type JourneySessionRow,
} from "./postgres-journey-practice-unit-of-work";
import { PostgresUserScope } from "./postgres-user-scope";

export class PostgresJourneyPracticeReader implements JourneyPracticeReader {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  async getSnapshot(authenticatedUserId: string, limit: number): Promise<JourneyPracticeReadSnapshot> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 101) {
      throw new Error("Journey practice read limit must be an integer between 1 and 101");
    }
    return this.userScope.run(authenticatedUserId, async (client) => {
      const activation = await client.query<JourneyActivationRow>(`
        SELECT journey_decision_id, user_id, journey_code, capability_code,
               starting_technique, decision_reason, source, correlation_id,
               request_id, request_fingerprint, decided_at, recorded_at
          FROM journey_capability_decision
         WHERE user_id = $1
      `, [authenticatedUserId]);
      if (!activation.rows[0]) return { sessions: [] };

      const sessions = await client.query<JourneySessionRow>(`
        SELECT practice_session_id, user_id, journey_decision_id, technique,
               experiment_intention, source, correlation_id, request_id,
               request_fingerprint, started_at, recorded_at
          FROM journey_practice_session
         WHERE user_id = $1
         ORDER BY started_at DESC, practice_session_id DESC
         LIMIT $2
      `, [authenticatedUserId, limit]);
      const ids = sessions.rows.map((row) => row.practice_session_id);
      const completions = ids.length === 0
        ? { rows: [] as JourneyCompletionRow[] }
        : await client.query<JourneyCompletionRow>(`
            SELECT practice_completion_id, practice_session_id, user_id,
                   reflection_note, retained_learning_candidate, source,
                   correlation_id, request_id, request_fingerprint,
                   completed_at, recorded_at
              FROM journey_practice_completion
             WHERE user_id = $1 AND practice_session_id = ANY($2::text[])
          `, [authenticatedUserId, ids]);
      const bySession = new Map(
        completions.rows.map((row) => [row.practice_session_id, journeyCompletionFromRow(row)]),
      );
      return {
        activation: journeyActivationFromRow(activation.rows[0]),
        sessions: sessions.rows.map((row) => ({
          session: journeySessionFromRow(row),
          ...(bySession.has(row.practice_session_id)
            ? { completion: bySession.get(row.practice_session_id)! }
            : {}),
        })),
      };
    });
  }
}
