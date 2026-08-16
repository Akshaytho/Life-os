import type { Pool } from "pg";
import type {
  DirectionDecisionReader,
  DirectionDecisionReadRecord,
} from "../domain/direction-read";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type DirectionRow = {
  direction_id: string;
  user_id: string;
  statement: string;
  status: DirectionDecisionReadRecord["status"];
  decided_at: Date;
  ended_at: Date | null;
};

export class PostgresDirectionDecisionReader implements DirectionDecisionReader {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  async listForUser(
    authenticatedUserId: string,
    limit: number,
  ): Promise<DirectionDecisionReadRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 102) {
      throw new Error("Direction read limit must be an integer between 1 and 102");
    }

    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<DirectionRow>(
        `SELECT direction_id, user_id, statement, status, decided_at, ended_at
           FROM direction_decision
          WHERE user_id = $1
          ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
                   decided_at DESC,
                   direction_id DESC
          LIMIT $2`,
        [authenticatedUserId, limit],
      );

      return result.rows.map((row) => ({
        directionId: row.direction_id,
        userId: row.user_id,
        statement: row.statement,
        status: row.status,
        decidedAt: iso(row.decided_at),
        endedAt: row.ended_at ? iso(row.ended_at) : null,
      }));
    });
  }
}
