import type {
  AppliedProposalRecord,
  CaptureRecord,
  DomainEventRecord,
  RoutingInterpretationRecord,
  RoutingProposalRecord,
} from "./write-boundary";

export interface PersistedInteractionProposalTrace {
  proposal: RoutingProposalRecord;
  applied?: AppliedProposalRecord;
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
