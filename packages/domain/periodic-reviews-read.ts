import type { PeriodicReviewIdentity, PeriodicReviewKind, PeriodicReviewStatus } from "../contracts/periodic-reviews";

export interface PeriodicReviewReadRecord extends PeriodicReviewIdentity {
  reviewId: string;
  userId: string;
  whatMattered: string;
  whatChanged: string;
  whatMovedForward: string;
  driftAndReturn: string;
  whatWasLearned: string;
  carryForward: string;
  worthPreserving: string | null;
  status: PeriodicReviewStatus;
  submittedAt: string;
  recordedAt: string;
  endedAt: string | null;
}

export interface PeriodicReviewReader {
  listReviews(
    authenticatedUserId: string,
    identity: PeriodicReviewIdentity,
    limit: number,
  ): Promise<PeriodicReviewReadRecord[]>;
  listCurrentInRange(
    authenticatedUserId: string,
    kind: PeriodicReviewKind,
    periodStart: string,
    periodEnd: string,
    limit: number,
  ): Promise<PeriodicReviewReadRecord[]>;
}
