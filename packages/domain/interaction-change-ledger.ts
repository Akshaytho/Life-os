import type {
  AppliedProposalRecord,
  CaptureRecord,
  DomainEventRecord,
  ProposalRejectionRecord,
  RoutingInterpretationRecord,
  RoutingProposalRecord,
} from "./write-boundary";

export interface PersistedInteractionProposalTrace {
  proposal: RoutingProposalRecord;
  applied?: AppliedProposalRecord;
  rejection?: ProposalRejectionRecord;
  event?: DomainEventRecord;
}

export interface PersistedInteractionChangeTrace {
  capture: CaptureRecord;
  interpretation?: RoutingInterpretationRecord;
  proposals: PersistedInteractionProposalTrace[];
}

export interface InteractionChangeLedgerReader {
  getTrace(captureId: string, authenticatedUserId: string): Promise<PersistedInteractionChangeTrace | undefined>;
}
