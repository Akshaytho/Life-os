import { createHash } from "node:crypto";
import type {
  CalendarCategory,
  CalendarCommitment,
  Clock,
  WriteRequestContext,
} from "../../../packages/domain/write-boundary";
import type {
  ApprovalMode,
  ProposalState,
} from "../../../packages/contracts/input-routing";

export interface CalendarProposalForConfirmation {
  proposalId: string;
  userId: string;
  captureId: string;
  destination: "CALENDAR";
  operation: "CREATE_CALENDAR_PLAN";
  approvalMode: ApprovalMode;
  state: ProposalState;
  payloadJson: Record<string, unknown>;
}

export interface CalendarProposalConfirmationTransaction {
  getForUpdate(proposalId: string, authenticatedUserId: string): Promise<CalendarProposalForConfirmation | undefined>;
  markReady(proposalId: string, authenticatedUserId: string, payloadJson: Record<string, unknown>): Promise<void>;
}

export interface CalendarProposalConfirmationStore {
  run<T>(
    authenticatedUserId: string,
    work: (transaction: CalendarProposalConfirmationTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface ConfirmCalendarProposalCommand {
  proposalId: string;
  plan: {
    title: string;
    startsAt: string;
    endsAt: string;
    category: CalendarCategory;
    commitment: CalendarCommitment;
    timeZone: string;
  };
}

export interface CalendarProposalConfirmationReceipt {
  proposalId: string;
  state: "READY_TO_APPLY";
  confirmedAt: string;
  idempotentReplay: boolean;
}

export interface ConfirmCalendarProposalDependencies {
  store: CalendarProposalConfirmationStore;
  clock: Clock;
}

export class CalendarProposalConfirmationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_REQUEST"
      | "PROPOSAL_UNAVAILABLE"
      | "PROPOSAL_NOT_CONFIRMABLE"
      | "CONFIRMATION_CONFLICT",
  ) {
    super(message);
    this.name = "CalendarProposalConfirmationError";
  }
}

const calendarCategories: readonly CalendarCategory[] = [
  "Work", "Creator", "Learning", "Health", "Family", "Friends", "Travel", "Personal", "Rest",
];
const calendarCommitments: readonly CalendarCommitment[] = ["Fixed", "Important", "Flexible", "Optional"];
const zonedTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new CalendarProposalConfirmationError(`${label} is required`, "INVALID_REQUEST");
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new CalendarProposalConfirmationError(`${label} is invalid`, "INVALID_REQUEST");
  }
  return normalized;
}

function normalizeTimestamp(value: unknown, label: string): string {
  const text = requiredText(value, label, 80);
  if (!zonedTimestampPattern.test(text)) {
    throw new CalendarProposalConfirmationError(`${label} must include an explicit UTC offset or Z`, "INVALID_REQUEST");
  }
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) {
    throw new CalendarProposalConfirmationError(`${label} must be a valid timestamp`, "INVALID_REQUEST");
  }
  return new Date(milliseconds).toISOString();
}

function normalizeTimeZone(value: unknown): string {
  const timeZone = requiredText(value, "plan.timeZone", 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
  } catch {
    throw new CalendarProposalConfirmationError("plan.timeZone must be a valid IANA time zone", "INVALID_REQUEST");
  }
  return timeZone;
}

function normalizePlan(command: ConfirmCalendarProposalCommand) {
  const title = requiredText(command.plan?.title, "plan.title", 160);
  const startsAt = normalizeTimestamp(command.plan?.startsAt, "plan.startsAt");
  const endsAt = normalizeTimestamp(command.plan?.endsAt, "plan.endsAt");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new CalendarProposalConfirmationError("plan.endsAt must be after plan.startsAt", "INVALID_REQUEST");
  }
  if (!calendarCategories.includes(command.plan?.category)) {
    throw new CalendarProposalConfirmationError("plan.category is invalid", "INVALID_REQUEST");
  }
  if (!calendarCommitments.includes(command.plan?.commitment)) {
    throw new CalendarProposalConfirmationError("plan.commitment is invalid", "INVALID_REQUEST");
  }

  return {
    title,
    startsAt,
    endsAt,
    category: command.plan.category,
    commitment: command.plan.commitment,
    timeZone: normalizeTimeZone(command.plan?.timeZone),
  };
}

function scalarText(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function originalPlan(payload: Record<string, unknown>) {
  const result: Record<string, string> = {};
  for (const key of ["title", "startsAt", "endsAt", "category", "commitment"] as const) {
    const value = scalarText(payload, key);
    if (value) result[key] = value;
  }
  return result;
}

function confirmationOf(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const value = payload.confirmation;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function fingerprint(
  authenticatedUserId: string,
  proposalId: string,
  plan: ReturnType<typeof normalizePlan>,
): string {
  return createHash("sha256").update(JSON.stringify({
    authenticatedUserId,
    proposalId,
    plan,
  })).digest("hex");
}

function validateContext(command: ConfirmCalendarProposalCommand, context: WriteRequestContext) {
  requiredText(command.proposalId, "proposalId", 200);
  requiredText(context.principal.userId, "requestContext.principal.userId", 200);
  requiredText(context.requestId, "requestContext.requestId", 200);
  if (context.principal.actorType !== "USER") {
    throw new CalendarProposalConfirmationError("Calendar confirmation requires an authenticated user", "INVALID_REQUEST");
  }
  if (context.source !== "WEB_APP" && context.source !== "MCP" && context.source !== "AI_CHAT") {
    throw new CalendarProposalConfirmationError("Calendar confirmation source is not user-interactive", "INVALID_REQUEST");
  }
  if (!Number.isFinite(Date.parse(context.receivedAt))) {
    throw new CalendarProposalConfirmationError("requestContext.receivedAt is invalid", "INVALID_REQUEST");
  }
}

function validateProposal(proposal: CalendarProposalForConfirmation) {
  if (proposal.destination !== "CALENDAR" || proposal.operation !== "CREATE_CALENDAR_PLAN") {
    throw new CalendarProposalConfirmationError("Proposal is not a Calendar create operation", "PROPOSAL_NOT_CONFIRMABLE");
  }
  if (proposal.approvalMode !== "EXPLICIT_CONFIRMATION") {
    throw new CalendarProposalConfirmationError("Proposal does not use the V1 Calendar confirmation mode", "PROPOSAL_NOT_CONFIRMABLE");
  }
}

export async function confirmCalendarProposal(
  command: ConfirmCalendarProposalCommand,
  context: WriteRequestContext,
  dependencies: ConfirmCalendarProposalDependencies,
): Promise<CalendarProposalConfirmationReceipt> {
  validateContext(command, context);
  const plan = normalizePlan(command);
  const authenticatedUserId = context.principal.userId;
  const requestFingerprint = fingerprint(authenticatedUserId, command.proposalId, plan);

  return dependencies.store.run(authenticatedUserId, async (transaction) => {
    const proposal = await transaction.getForUpdate(command.proposalId, authenticatedUserId);
    if (!proposal || proposal.userId !== authenticatedUserId) {
      throw new CalendarProposalConfirmationError("Proposal is unavailable for this authenticated user", "PROPOSAL_UNAVAILABLE");
    }
    validateProposal(proposal);

    const existingConfirmation = confirmationOf(proposal.payloadJson);
    if (proposal.state === "READY_TO_APPLY") {
      if (
        existingConfirmation?.version === 1
        && existingConfirmation.confirmedByActorId === authenticatedUserId
        && existingConfirmation.fingerprint === requestFingerprint
        && typeof existingConfirmation.confirmedAt === "string"
      ) {
        return {
          proposalId: proposal.proposalId,
          state: "READY_TO_APPLY",
          confirmedAt: existingConfirmation.confirmedAt,
          idempotentReplay: true,
        };
      }
      throw new CalendarProposalConfirmationError(
        "Proposal was already confirmed with different Calendar details",
        "CONFIRMATION_CONFLICT",
      );
    }

    if (proposal.state !== "NEEDS_CONFIRMATION") {
      throw new CalendarProposalConfirmationError(
        `Proposal cannot be confirmed from state ${proposal.state}`,
        "PROPOSAL_NOT_CONFIRMABLE",
      );
    }
    if (existingConfirmation) {
      throw new CalendarProposalConfirmationError(
        "Open proposal unexpectedly contains confirmation provenance",
        "CONFIRMATION_CONFLICT",
      );
    }

    const confirmedAt = dependencies.clock.now();
    if (!Number.isFinite(Date.parse(confirmedAt))) {
      throw new CalendarProposalConfirmationError("Confirmation clock returned an invalid timestamp", "INVALID_REQUEST");
    }

    const payloadJson: Record<string, unknown> = {
      ...proposal.payloadJson,
      title: plan.title,
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      category: plan.category,
      commitment: plan.commitment,
      confirmation: {
        version: 1,
        confirmedByActorId: authenticatedUserId,
        confirmedAt,
        requestId: context.requestId,
        source: context.source,
        timeZone: plan.timeZone,
        fingerprint: requestFingerprint,
        interpretedPlan: originalPlan(proposal.payloadJson),
      },
    };

    await transaction.markReady(proposal.proposalId, authenticatedUserId, payloadJson);
    return {
      proposalId: proposal.proposalId,
      state: "READY_TO_APPLY",
      confirmedAt,
      idempotentReplay: false,
    };
  });
}
