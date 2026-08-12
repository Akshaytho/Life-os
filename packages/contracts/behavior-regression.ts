import type { InteractionTraceStatus } from "./interaction-change-ledger";
import type {
  ProposalState,
  ProposedOperation,
  RoutingDestination,
  RoutingTrustClass,
} from "./input-routing";
import type { RuntimeProvenance } from "./runtime-provenance";

export interface BehaviorRegressionProposalSummary {
  destination: RoutingDestination;
  operation: ProposedOperation;
  state: ProposalState;
  proposedResultClass: RoutingTrustClass;
  userAction?: "APPROVED" | "REJECTED";
  canonicalEventType?: string;
}

export interface BehaviorRegressionScenarioResult {
  scenarioId: string;
  status: InteractionTraceStatus;
  proposalCount: number;
  proposals: BehaviorRegressionProposalSummary[];
  projectionEffectsStatus: "NOT_RECORDED_YET" | "RECORDED";
}

/**
 * CI/developer behavior snapshot only. It deliberately excludes raw source text,
 * interpretation prose, proposal reasons/summaries, user IDs, payload JSON,
 * credentials, request IDs and arbitrary metadata.
 */
export interface BehaviorRegressionReport {
  schemaVersion: 1;
  generatedAt: string;
  runtime: Pick<RuntimeProvenance, "environment" | "releaseSha" | "platform">;
  scenarios: BehaviorRegressionScenarioResult[];
}
