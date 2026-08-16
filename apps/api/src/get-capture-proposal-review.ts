import type { CaptureProposalReview, ProposalReviewDetail } from "../../../packages/contracts/proposal-review";
import type { ProposalReviewReader, PersistedCaptureProposalReview } from "../../../packages/domain/proposal-review";
import type { AuthenticatedUserPrincipal, RoutingProposalRecord } from "../../../packages/domain/write-boundary";

export class ProposalReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalReviewValidationError";
  }
}

export interface ProposalReviewReadContext {
  principal: AuthenticatedUserPrincipal;
}

export interface ProposalReviewDependencies {
  reader: ProposalReviewReader;
}

function requireText(value: string, label: string) {
  if (!value.trim()) throw new ProposalReviewValidationError(`${label} is required`);
}

function scalar(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function calendarDetails(proposal: RoutingProposalRecord): ProposalReviewDetail[] {
  const fields: Array<[string, string]> = [
    ["title", "Title"],
    ["startsAt", "Starts"],
    ["endsAt", "Ends"],
    ["category", "Category"],
    ["commitment", "Commitment"],
  ];

  return fields.flatMap(([key, label]) => {
    const value = scalar(proposal.payloadJson[key]);
    return value === undefined ? [] : [{ key, label, value }];
  });
}

function reviewDetails(proposal: RoutingProposalRecord): ProposalReviewDetail[] {
  if (proposal.destination === "CALENDAR" && proposal.operation === "CREATE_CALENDAR_PLAN") {
    return calendarDetails(proposal);
  }
  return [];
}

function assertPersistedOwnership(
  persisted: PersistedCaptureProposalReview,
  requestedCaptureId: string,
  authenticatedUserId: string,
) {
  if (persisted.capture.captureId !== requestedCaptureId || persisted.capture.userId !== authenticatedUserId) {
    throw new ProposalReviewValidationError("Proposal review reader returned Capture outside authenticated scope");
  }

  const interpretation = persisted.interpretation;
  if (interpretation) {
    if (interpretation.captureId !== requestedCaptureId || interpretation.userId !== authenticatedUserId) {
      throw new ProposalReviewValidationError("Proposal review reader returned interpretation outside Capture ownership");
    }
  } else if (persisted.proposals.length > 0) {
    throw new ProposalReviewValidationError("Proposal review reader returned proposals without their interpretation");
  }

  for (const proposal of persisted.proposals) {
    if (proposal.captureId !== requestedCaptureId || proposal.userId !== authenticatedUserId) {
      throw new ProposalReviewValidationError(`Proposal ${proposal.proposalId} is outside Capture ownership`);
    }
    if (interpretation && proposal.interpretationId !== interpretation.interpretationId) {
      throw new ProposalReviewValidationError(`Proposal ${proposal.proposalId} is outside interpretation provenance`);
    }
  }
}

export async function getCaptureProposalReview(
  captureId: string,
  context: ProposalReviewReadContext,
  dependencies: ProposalReviewDependencies,
): Promise<CaptureProposalReview | undefined> {
  requireText(captureId, "captureId");
  requireText(context.principal.userId, "principal.userId");

  if (context.principal.actorType !== "USER") {
    throw new ProposalReviewValidationError("Proposal review requires an authenticated user principal");
  }

  const persisted = await dependencies.reader.getCaptureReview(captureId, context.principal.userId);
  if (!persisted) return undefined;
  assertPersistedOwnership(persisted, captureId, context.principal.userId);

  return {
    reviewState: persisted.interpretation ? "READY_FOR_REVIEW" : "AWAITING_INTERPRETATION",
    source: {
      captureId: persisted.capture.captureId,
      rawText: persisted.capture.rawText,
      authorityClass: "USER_SOURCE",
      sourceActor: "USER",
      source: persisted.capture.source,
      correlationId: persisted.capture.correlationId,
      receivedAt: persisted.capture.receivedAt,
      recordedAt: persisted.capture.recordedAt,
    },
    interpretation: persisted.interpretation
      ? {
          interpretationId: persisted.interpretation.interpretationId,
          authorityClass: "OBSERVATION",
          interpreter: persisted.interpretation.interpreter,
          intent: persisted.interpretation.intent,
          certainty: persisted.interpretation.certainty,
          confidence: persisted.interpretation.confidence,
          observations: persisted.interpretation.observations.map((item) => ({ ...item })),
          clarification: persisted.interpretation.clarification,
          createdAt: persisted.interpretation.createdAt,
        }
      : undefined,
    proposals: persisted.proposals.map((proposal) => ({
      proposalId: proposal.proposalId,
      authorityClass: "SUGGESTION" as const,
      destination: proposal.destination,
      operation: proposal.operation,
      summary: proposal.summary,
      proposedResultClass: proposal.targetTrustClass,
      approvalMode: proposal.approvalMode,
      state: proposal.state,
      reason: proposal.reason,
      details: reviewDetails(proposal),
      createdAt: proposal.createdAt,
      appliedAt: proposal.appliedAt,
      appliedEntityId: proposal.appliedEntityId,
      appliedEventId: proposal.appliedEventId,
    })),
  };
}
