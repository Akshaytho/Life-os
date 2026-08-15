import type { Pool } from "pg";
import type {
  CanonicalCalendarReader,
  CanonicalCalendarRecord,
} from "../domain/canonical-calendar-read";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type CalendarRow = {
  id: string;
  user_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  category: CanonicalCalendarRecord["category"];
  commitment: CanonicalCalendarRecord["commitment"];
  created_at: Date;
  source_proposal_id: string;
};

export class PostgresCanonicalCalendarReader implements CanonicalCalendarReader {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  async listOverlapping(
    authenticatedUserId: string,
    fromInclusive: string,
    toExclusive: string,
  ): Promise<CanonicalCalendarRecord[]> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<CalendarRow>(
        `SELECT id, user_id, title, starts_at, ends_at, category, commitment, created_at, source_proposal_id
           FROM calendar_event
          WHERE user_id = $1
            AND starts_at < $3
            AND ends_at > $2
          ORDER BY starts_at, id
          LIMIT 201`,
        [authenticatedUserId, fromInclusive, toExclusive],
      );

      return result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        startsAt: iso(row.starts_at),
        endsAt: iso(row.ends_at),
        category: row.category,
        commitment: row.commitment,
        createdAt: iso(row.created_at),
        sourceProposalId: row.source_proposal_id,
      }));
    });
  }
}
