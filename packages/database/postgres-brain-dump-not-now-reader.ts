import type { Pool } from "pg";
import type {
  BrainDumpNotNowReader,
  BrainDumpReadRecord,
  NotNowReadRecord,
} from "../domain/brain-dump-not-now-read";
import { PostgresUserScope } from "./postgres-user-scope";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class PostgresBrainDumpNotNowReader implements BrainDumpNotNowReader {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  async listBrainDumpItems(authenticatedUserId: string, limit: number): Promise<BrainDumpReadRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 101) {
      throw new Error("Brain Dump read limit must be an integer between 1 and 101");
    }
    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<{
        capture_id: string;
        user_id: string;
        raw_text: string;
        source: BrainDumpReadRecord["source"];
        received_at: Date;
        recorded_at: Date;
        brain_dump_classification_id: string | null;
        category: BrainDumpReadRecord["category"];
        classification_status: BrainDumpReadRecord["classificationStatus"];
        confirmed_at: Date | null;
        classification_recorded_at: Date | null;
      }>(
        `SELECT c.capture_id, c.user_id, c.raw_text, c.source, c.received_at, c.recorded_at,
                b.brain_dump_classification_id, b.category,
                b.status AS classification_status, b.confirmed_at,
                b.recorded_at AS classification_recorded_at
           FROM capture_record c
           LEFT JOIN brain_dump_classification b
             ON b.capture_id = c.capture_id
            AND b.user_id = c.user_id
            AND b.status = 'CURRENT'
          WHERE c.user_id = $1
          ORDER BY c.received_at DESC, c.capture_id DESC
          LIMIT $2`,
        [authenticatedUserId, limit],
      );
      return result.rows.map((row) => ({
        captureId: row.capture_id,
        userId: row.user_id,
        rawText: row.raw_text,
        source: row.source,
        capturedAt: iso(row.received_at),
        recordedAt: iso(row.recorded_at),
        classificationId: row.brain_dump_classification_id,
        category: row.category,
        classificationStatus: row.classification_status,
        classificationConfirmedAt: row.confirmed_at ? iso(row.confirmed_at) : null,
        classificationRecordedAt: row.classification_recorded_at
          ? iso(row.classification_recorded_at)
          : null,
      }));
    });
  }

  async listNotNowItems(authenticatedUserId: string, limit: number): Promise<NotNowReadRecord[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 101) {
      throw new Error("NOT NOW read limit must be an integer between 1 and 101");
    }
    return this.userScope.run(authenticatedUserId, async (client) => {
      const result = await client.query<{
        not_now_item_id: string;
        root_id: string;
        revision: number;
        capture_id: string;
        user_id: string;
        raw_text: string;
        source: NotNowReadRecord["source"];
        assessment: NotNowReadRecord["assessment"];
        posture: NotNowReadRecord["posture"];
        lifecycle_state: NotNowReadRecord["state"];
        review_note: string | null;
        decided_at: Date;
        recorded_at: Date;
      }>(
        `SELECT n.not_now_item_id, n.root_id, n.revision, n.capture_id, n.user_id,
                c.raw_text, c.source, n.assessment, n.posture, n.lifecycle_state,
                n.review_note, n.decided_at, n.recorded_at
           FROM not_now_item n
           JOIN capture_record c
             ON c.capture_id = n.capture_id AND c.user_id = n.user_id
          WHERE n.user_id = $1 AND n.status = 'CURRENT'
          ORDER BY n.decided_at DESC, n.not_now_item_id DESC
          LIMIT $2`,
        [authenticatedUserId, limit],
      );
      return result.rows.map((row) => ({
        itemId: row.not_now_item_id,
        rootId: row.root_id,
        revision: row.revision,
        captureId: row.capture_id,
        userId: row.user_id,
        rawText: row.raw_text,
        source: row.source,
        assessment: row.assessment,
        posture: row.posture,
        state: row.lifecycle_state,
        reviewNote: row.review_note,
        decidedAt: iso(row.decided_at),
        recordedAt: iso(row.recorded_at),
      }));
    });
  }
}
