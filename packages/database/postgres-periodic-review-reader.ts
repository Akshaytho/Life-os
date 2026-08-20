import type { Pool } from "pg";
import type { PeriodicReviewKind } from "../contracts/periodic-reviews";
import type {
  PeriodicReviewReader,
  PeriodicReviewReadRecord,
} from "../domain/periodic-reviews-read";
import {
  periodicReviewFromRow,
  type PeriodicReviewRow,
} from "./postgres-periodic-review-unit-of-work";
import { PostgresUserScope } from "./postgres-user-scope";

const selectColumns = `periodic_review_id, user_id, period_kind,
  period_start::text, period_end::text, time_zone, what_mattered, what_changed,
  what_moved_forward, drift_and_return, what_was_learned, carry_forward,
  worth_preserving, status, submitted_at, recorded_at, ended_at,
  supersedes_review_id, request_id, request_fingerprint`;

function readRecord(row: PeriodicReviewRow): PeriodicReviewReadRecord {
  const value = periodicReviewFromRow(row);
  return {
    reviewId: value.reviewId,
    userId: value.userId,
    kind: value.kind,
    periodStart: value.periodStart,
    periodEnd: value.periodEnd,
    timeZone: value.timeZone,
    whatMattered: value.whatMattered,
    whatChanged: value.whatChanged,
    whatMovedForward: value.whatMovedForward,
    driftAndReturn: value.driftAndReturn,
    whatWasLearned: value.whatWasLearned,
    carryForward: value.carryForward,
    worthPreserving: value.worthPreserving ?? null,
    status: value.status,
    submittedAt: value.submittedAt,
    recordedAt: value.recordedAt,
    endedAt: value.endedAt ?? null,
  };
}

function checkedLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 24) {
    throw new Error("Periodic review read limit must be an integer between 1 and 24");
  }
  return limit;
}

export class PostgresPeriodicReviewReader implements PeriodicReviewReader {
  private readonly userScope: PostgresUserScope;
  constructor(pool: Pool) { this.userScope = new PostgresUserScope(pool) }

  listReviews(
    authenticatedUserId: string,
    identity: { kind: PeriodicReviewKind; periodStart: string },
    limit: number,
  ) {
    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<PeriodicReviewRow>(
        `SELECT ${selectColumns} FROM periodic_review
          WHERE user_id = $1 AND period_kind = $2 AND period_start = $3::date
          ORDER BY CASE WHEN status = 'CURRENT' THEN 0 ELSE 1 END,
                   submitted_at DESC, periodic_review_id DESC
          LIMIT $4`,
        [authenticatedUserId, identity.kind, identity.periodStart, checkedLimit(limit)],
      );
      return result.rows.map(readRecord);
    });
  }

  listCurrentInRange(
    authenticatedUserId: string,
    kind: PeriodicReviewKind,
    periodStart: string,
    periodEnd: string,
    limit: number,
  ) {
    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<PeriodicReviewRow>(
        `SELECT ${selectColumns} FROM periodic_review
          WHERE user_id = $1 AND period_kind = $2 AND status = 'CURRENT'
            AND period_start >= $3::date AND period_end <= $4::date
          ORDER BY period_start, periodic_review_id
          LIMIT $5`,
        [authenticatedUserId, kind, periodStart, periodEnd, checkedLimit(limit)],
      );
      return result.rows.map(readRecord);
    });
  }
}
