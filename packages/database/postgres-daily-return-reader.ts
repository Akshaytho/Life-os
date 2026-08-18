import type { Pool } from "pg";
import type {
  DailyLogEntryReadRecord,
  DailyReturnReader,
  DailyReturnReviewReadRecord,
} from "../domain/daily-return-read";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type DailyLogEntryRow = {
  daily_log_entry_id: string;
  user_id: string;
  local_date: string;
  time_zone: string;
  body: string;
  occurred_at: Date;
  recorded_at: Date;
};

type DailyReturnReviewRow = {
  daily_return_review_id: string;
  user_id: string;
  local_date: string;
  time_zone: string;
  what_happened: string;
  what_moved_forward: string;
  what_pulled_me_away: string;
  return_to_tomorrow: string;
  return_state: DailyReturnReviewReadRecord["returnState"];
  status: DailyReturnReviewReadRecord["status"];
  submitted_at: Date;
  recorded_at: Date;
  ended_at: Date | null;
};

export class PostgresDailyReturnReader implements DailyReturnReader {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  async listLogEntriesForDate(
    authenticatedUserId: string,
    localDate: string,
    limit: number,
  ): Promise<DailyLogEntryReadRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 201) {
      throw new Error("Daily Log read limit must be an integer between 1 and 201");
    }
    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<DailyLogEntryRow>(
        `SELECT daily_log_entry_id, user_id, local_date::text, time_zone, body,
                occurred_at, recorded_at
           FROM daily_log_entry
          WHERE user_id = $1 AND local_date = $2::date
          ORDER BY occurred_at, daily_log_entry_id
          LIMIT $3`,
        [authenticatedUserId, localDate, limit],
      );
      return result.rows.map((row) => ({
        entryId: row.daily_log_entry_id,
        userId: row.user_id,
        localDate: row.local_date,
        timeZone: row.time_zone,
        body: row.body,
        occurredAt: iso(row.occurred_at),
        recordedAt: iso(row.recorded_at),
      }));
    });
  }

  async listReviewsForDate(
    authenticatedUserId: string,
    localDate: string,
    limit: number,
  ): Promise<DailyReturnReviewReadRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 22) {
      throw new Error("Daily Return review limit must be an integer between 1 and 22");
    }
    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<DailyReturnReviewRow>(
        `SELECT daily_return_review_id, user_id, local_date::text, time_zone,
                what_happened, what_moved_forward, what_pulled_me_away,
                return_to_tomorrow, return_state, status, submitted_at, recorded_at,
                ended_at
           FROM daily_return_review
          WHERE user_id = $1 AND local_date = $2::date
          ORDER BY CASE WHEN status = 'CURRENT' THEN 0 ELSE 1 END,
                   submitted_at DESC,
                   daily_return_review_id DESC
          LIMIT $3`,
        [authenticatedUserId, localDate, limit],
      );
      return result.rows.map((row) => ({
        reviewId: row.daily_return_review_id,
        userId: row.user_id,
        localDate: row.local_date,
        timeZone: row.time_zone,
        whatHappened: row.what_happened,
        whatMovedForward: row.what_moved_forward,
        whatPulledMeAway: row.what_pulled_me_away,
        returnToTomorrow: row.return_to_tomorrow,
        returnState: row.return_state,
        status: row.status,
        submittedAt: iso(row.submitted_at),
        recordedAt: iso(row.recorded_at),
        endedAt: row.ended_at ? iso(row.ended_at) : null,
      }));
    });
  }
}
