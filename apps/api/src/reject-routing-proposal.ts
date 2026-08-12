import type {
  Clock,
  ProposalRejectionReceipt,
  RejectStoredProposalCommand,
  WriteRequestContext,
  WriteUnitOfWork,
} from "../../../packages/domain/write-boundary";

export class ProposalRejectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalRejectionError";
  }
}

export interface RejectRoutingProposalDependencies {
  unitOfWork: WriteUnitOfWork;
  clock: Clock;
}

function requireText(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new ProposalRejectionError(`${label} is required`);
}

function normalizeReason(reason: string | undefined): string | undefined {
  if (reason === undefined) return undefined;
  const normalized = reason.trim();
  if (!normalized) throw new ProposalRejectionError("reason must contain text when provided");
  if (normalized.length > 1000) throw new ProposalRejectionError("reason must be 1000 characters or fewer");
  return normalized;
}

function validate(command: RejectStoredProposalCommand, context: WriteRequestContext) {
  requireText(command.proposalId, "proposalId");
  requireText(context.principal.userId, "requestContext.principal.userId");
  requireText(context.requestId, "requestContext.requestId");
  if (context.principal.actorType !== "USER") {
    throw new ProposalRejectionError("Proposal rejection requires an authenticated user principal");
  }
  if (!Number.isFinite(Date.parse(context.receivedAt))) {
    throw new ProposalRejectionError("requestContext.receivedAt must be a valid timestamp");
  }
}

export async function rejectRoutingProposal(
  command: RejectStoredProposalCommand,
  context: WriteRequestContext,
  dependencies: RejectRoutingProposalDependencies,
): Promise<ProposalRejectionReceipt> {
  validate(command, context);
  const authenticatedUserId = context.principal.userId;
  const reason = normalizeReason(command.reason);

  return dependencies.unitOfWork.run(authenticatedUserId, async (transaction) => {
    const proposal = await transaction.getRoutingProposalForUpdate(command.proposalId, authenticatedUserId);
    if (!proposal) throw new ProposalRejectionError("Proposal is unavailable for this authenticated user");

    const existing = await transaction.findProposalRejection(command.proposalId);

    if (proposal.state === "APPLIED") {
      if (existing) throw new Error("Applied proposal unexpectedly has rejection provenance");
      throw new ProposalRejectionError("An applied proposal cannot be rejected");
    }

    if (proposal.state === "REJECTED") {
      if (!existing || existing.userId !== authenticatedUserId || existing.rejectedByActorId !== authenticatedUserId) {
        throw new Error("Rejected proposal is missing valid user rejection provenance");
      }
      if ((existing.reason ?? undefined) !== reason) {
        throw new ProposalRejectionError("This proposal was already rejected with different feedback");
      }
      return {
        proposalId: existing.proposalId,
        rejectedAt: existing.rejectedAt,
        recordedAt: existing.recordedAt,
        rejectedByActorId: existing.rejectedByActorId,
        reason: existing.reason,
        idempotentReplay: true,
      };
    }

    if (existing) throw new Error("Proposal rejection marker exists while proposal state is not REJECTED");

    const recordedAt = dependencies.clock.now();
    if (!Number.isFinite(Date.parse(recordedAt))) throw new ProposalRejectionError("clock.now() must return a valid timestamp");
    if (Date.parse(recordedAt) < Date.parse(context.receivedAt)) {
      throw new ProposalRejectionError("recordedAt cannot be before the trusted rejection time");
    }

    const rejection = {
      proposalId: proposal.proposalId,
      userId: authenticatedUserId,
      rejectedAt: context.receivedAt,
      recordedAt,
      rejectedByActorId: authenticatedUserId,
      reason,
    };

    await transaction.createProposalRejection(rejection);
    await transaction.markRoutingProposalRejected(proposal.proposalId, authenticatedUserId);

    return {
      proposalId: rejection.proposalId,
      rejectedAt: rejection.rejectedAt,
      recordedAt: rejection.recordedAt,
      rejectedByActorId: rejection.rejectedByActorId,
      reason: rejection.reason,
      idempotentReplay: false,
    };
  });
}
