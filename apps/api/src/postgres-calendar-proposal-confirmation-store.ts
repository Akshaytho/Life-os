import type { Pool } from "pg";
import { PostgresUserScope } from "../../../packages/database/postgres-user-scope";
import type {
  CalendarProposalConfirmationStore,
  CalendarProposalForConfirmation,
} from "./confirm-calendar-proposal";

export class PostgresCalendarProposalConfirmationStore implements CalendarProposalConfirmationStore {
  private readonly userScope: PostgresUserScope;

  constructor(pool: Pool) {
    this.userScope = new PostgresUserScope(pool);
  }

  run<T>(
    authenticatedUserId: string,
    work: (transaction: {
      getForUpdate(proposalId: string, authenticatedUserId: string): Promise<CalendarProposalForConfirmation | undefined>;
      markReady(proposalId: string, authenticatedUserId: string, payloadJson: Record<string, unknown>): Promise<void>;
    }) => Promise<T>,
  ): Promise<T> {
    return this.userScope.run(authenticatedUserId, async (client) => work({
      async getForUpdate(proposalId, scopedUserId) {
        if (scopedUserId !== authenticatedUserId) throw new Error("Calendar confirmation user scope mismatch");
        const result = await client.query<{
          proposal_id: string;
          user_id: string;
          capture_id: string;
          destination: "CALENDAR";
          operation: "CREATE_CALENDAR_PLAN";
          approval_mode: CalendarProposalForConfirmation["approvalMode"];
          state: CalendarProposalForConfirmation["state"];
          payload_json: Record<string, unknown>;
        }>(
          `SELECT proposal_id, user_id, capture_id, destination, operation, approval_mode, state, payload_json
             FROM routing_proposal
            WHERE proposal_id = $1
              AND user_id = $2
              AND destination = 'CALENDAR'
              AND operation = 'CREATE_CALENDAR_PLAN'
            FOR UPDATE`,
          [proposalId, authenticatedUserId],
        );
        const row = result.rows[0];
        if (!row) return undefined;
        return {
          proposalId: row.proposal_id,
          userId: row.user_id,
          captureId: row.capture_id,
          destination: row.destination,
          operation: row.operation,
          approvalMode: row.approval_mode,
          state: row.state,
          payloadJson: row.payload_json,
        };
      },

      async markReady(proposalId, scopedUserId, payloadJson) {
        if (scopedUserId !== authenticatedUserId) throw new Error("Calendar confirmation user scope mismatch");
        const result = await client.query(
          `UPDATE routing_proposal
              SET payload_json = $3::jsonb,
                  state = 'READY_TO_APPLY'
            WHERE proposal_id = $1
              AND user_id = $2
              AND destination = 'CALENDAR'
              AND operation = 'CREATE_CALENDAR_PLAN'
              AND approval_mode = 'EXPLICIT_CONFIRMATION'
              AND state = 'NEEDS_CONFIRMATION'`,
          [proposalId, authenticatedUserId, JSON.stringify(payloadJson)],
        );
        if (result.rowCount !== 1) throw new Error(`Calendar proposal ${proposalId} was not confirmable`);
      },
    }));
  }
}
