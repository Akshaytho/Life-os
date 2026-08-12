import type {
  CaptureRecord,
  RoutingInterpretationRecord,
  RoutingProposalRecord,
} from "./write-boundary";

export interface PersistedCaptureProposalReview {
  capture: CaptureRecord;
  interpretation?: RoutingInterpretationRecord;
  proposals: RoutingProposalRecord[];
}

export interface ProposalReviewReader {
  getCaptureReview(captureId: string, authenticatedUserId: string): Promise<PersistedCaptureProposalReview | undefined>;
}
