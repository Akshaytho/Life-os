import type { Pool } from "pg";
import type {
  JourneyDecisionReader,
  JourneyDecisionReadRecord,
} from "../domain/journey-read";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type JourneyRow = {
  journey_id: string;
  user_id: string;
  name: string;
  active_capability: string;
  status: JourneyDecisionReadRecord["status"];
  decided_at: Date;
  ended_at: Date | null;
};

export class PostgresJourneyDecisionReader implements JourneyDecisionReader {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  async listForUser(
    authenticatedUserId: string,
    limit: number,
  ): Promise<JourneyDecisionReadRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 102) {
      throw new Error("Journey read limit must be an integer between 1 and 102");
    }

    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<JourneyRow>(
        `SELECT journey_id, user_id, name, active_capability, status, decided_at, ended_at
           FROM journey_decision
          WHERE user_id = $1
          ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
                   decided_at DESC,
                   journey_id DESC
          LIMIT $2`,
        [authenticatedUserId, limit],
      );

      return result.rows.map((row) => ({
        journeyId: row.journey_id,
        userId: row.user_id,
        name: row.name,
        activeCapability: row.active_capability,
        status: row.status,
        decidedAt: iso(row.decided_at),
        endedAt: row.ended_at ? iso(row.ended_at) : null,
      }));
    });
  }
}
