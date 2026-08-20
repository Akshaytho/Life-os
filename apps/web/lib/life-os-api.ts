import type { CanonicalCalendarWindow } from "../../../packages/contracts/canonical-calendar";
import type { AskLifeOsCommand, AskLifeOsResponse } from "../../../packages/contracts/ai-retrieval";
import type {
  BrainDumpClassificationReceipt,
  BrainDumpOverview,
  ConfirmBrainDumpClassificationCommand,
  NotNowItemReceipt,
  NotNowOverview,
  ParkNotNowItemCommand,
  ReviewNotNowItemCommand,
} from "../../../packages/contracts/brain-dump-not-now";
import type {
  DirectionDecisionOverview,
  SetCurrentDirectionCommand,
} from "../../../packages/contracts/direction";
import type {
  AppendDailyLogEntryCommand,
  DailyReturnOverview,
  SubmitDailyReturnReviewCommand,
} from "../../../packages/contracts/daily-return";
import type {
  ConfirmDriftUnderstandingCommand,
  DriftDecisionReceipt,
  DriftOccurrenceReceipt,
  DriftOverview,
  RecordDriftCommand,
  RecordDriftReturnCommand,
} from "../../../packages/contracts/drift-return";
import type {
  ActivateJourneyCommand,
  ActivateJourneyReceipt,
  CompleteJourneyPracticeCommand,
  CompleteJourneyPracticeReceipt,
  JourneyPracticeOverview,
  StartJourneyPracticeCommand,
  StartJourneyPracticeReceipt,
} from "../../../packages/contracts/journey-practice";
import type { InteractionChangeTrace } from "../../../packages/contracts/interaction-change-ledger";
import type { ProposalState } from "../../../packages/contracts/input-routing";
import type { CaptureProposalReview } from "../../../packages/contracts/proposal-review";
import type {
  GetPeriodicReviewOverviewCommand,
  PeriodicReviewOverview,
  PeriodicReviewReceipt,
  SubmitPeriodicReviewCommand,
} from "../../../packages/contracts/periodic-reviews";
import type {
  GetMemoryOverviewCommand,
  MemoryOverview,
  MemoryWriteReceipt,
  RetainMemoryItemCommand,
  ReviseMemoryItemCommand,
} from "../../../packages/contracts/memory";

export class LifeOsApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "LifeOsApiError";
  }
}

export interface CreateCaptureReceipt {
  status: "created" | "replayed";
  captureId: string;
  correlationId: string;
  interpretationId: string;
  proposalIds: string[];
  proposalStates: ProposalState[];
}

export interface ConfirmCalendarProposalInput {
  title: string;
  startsAt: string;
  endsAt: string;
  category: "Work" | "Creator" | "Learning" | "Health" | "Family" | "Friends" | "Travel" | "Personal" | "Rest";
  commitment: "Fixed" | "Important" | "Flexible" | "Optional";
  timeZone: string;
}

export interface ConfirmCalendarProposalReceipt {
  status: "ready_to_apply" | "replayed";
  proposalId: string;
  state: "READY_TO_APPLY";
  confirmedAt: string;
}

export interface ApplyProposalReceipt {
  status: "applied" | "replayed";
  proposalId: string;
  entityType: string;
  entityId: string;
  eventId: string;
  appliedAt: string;
}

export interface RejectProposalReceipt {
  status: "rejected" | "replayed";
  proposalId: string;
  rejectedAt: string;
  recordedAt: string;
}

export interface SetCurrentDirectionReceipt {
  status: "active" | "replayed";
  directionId: string;
  authorityClass: "DECISION";
  decidedAt: string;
  supersededDirectionId?: string;
}

export interface AppendDailyLogEntryReceipt {
  status: "recorded" | "replayed";
  entryId: string;
  authorityClass: "REFLECTION";
  occurredAt: string;
  recordedAt: string;
}

export interface SubmitDailyReturnReviewReceipt {
  status: "current" | "replayed";
  reviewId: string;
  authorityClass: "REFLECTION";
  submittedAt: string;
  recordedAt: string;
  supersededReviewId?: string;
}

export type BrainDumpClassificationTransportReceipt = Omit<BrainDumpClassificationReceipt, "status"> & {
  status: "recorded" | "replayed";
  decisionStatus: "CURRENT";
};

export type NotNowItemTransportReceipt = Omit<NotNowItemReceipt, "status"> & {
  status: "recorded" | "replayed";
  decisionStatus: "CURRENT";
};

export type DriftOccurrenceTransportReceipt = DriftOccurrenceReceipt & {
  status: "recorded" | "replayed";
};

export type DriftDecisionTransportReceipt = Omit<DriftDecisionReceipt, "status"> & {
  status: "recorded" | "replayed";
  decisionStatus: "CURRENT";
};

export type ActivateJourneyTransportReceipt = ActivateJourneyReceipt & {
  status: "recorded" | "replayed";
};

export type StartJourneyPracticeTransportReceipt = StartJourneyPracticeReceipt & {
  status: "recorded" | "replayed";
};

export type CompleteJourneyPracticeTransportReceipt = CompleteJourneyPracticeReceipt & {
  status: "recorded" | "replayed";
};

export function askLifeOs(
  accessToken: string,
  command: AskLifeOsCommand,
): Promise<AskLifeOsResponse> {
  return privateRequest<AskLifeOsResponse>(accessToken, "/api/v1/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
}

export function getPeriodicReviewOverview(
  accessToken: string,
  command: GetPeriodicReviewOverviewCommand,
): Promise<PeriodicReviewOverview> {
  const params = new URLSearchParams({
    kind: command.kind,
    periodStart: command.periodStart,
    periodEnd: command.periodEnd,
    timeZone: command.timeZone,
    calendarFrom: command.calendarFrom,
    calendarTo: command.calendarTo,
  });
  return privateRequest<PeriodicReviewOverview>(
    accessToken,
    `/api/v1/reviews/period?${params.toString()}`,
  );
}

export type PeriodicReviewTransportReceipt = Omit<PeriodicReviewReceipt, "status"> & {
  status: "recorded" | "replayed";
};

export function submitPeriodicReview(
  accessToken: string,
  command: SubmitPeriodicReviewCommand,
  idempotencyKey: string,
): Promise<PeriodicReviewTransportReceipt> {
  return privateRequest<PeriodicReviewTransportReceipt>(accessToken, "/api/v1/reviews/period", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(command),
  });
}

export function getMemoryOverview(
  accessToken: string,
  command: Omit<GetMemoryOverviewCommand, "now">,
): Promise<MemoryOverview> {
  const params = new URLSearchParams({ timeZone: command.timeZone });
  if (command.query) params.set("q", command.query);
  if (command.kind) params.set("kind", command.kind);
  return privateRequest<MemoryOverview>(accessToken, `/api/v1/memory?${params.toString()}`);
}

export type MemoryTransportReceipt = Omit<MemoryWriteReceipt, "status"> & {
  status: "recorded" | "replayed";
};

export function retainMemoryItem(
  accessToken: string,
  command: RetainMemoryItemCommand,
  idempotencyKey: string,
): Promise<MemoryTransportReceipt> {
  return privateRequest<MemoryTransportReceipt>(accessToken, "/api/v1/memory/items", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(command),
  });
}

export function reviseMemoryItem(
  accessToken: string,
  rootId: string,
  command: ReviseMemoryItemCommand,
  idempotencyKey: string,
): Promise<MemoryTransportReceipt> {
  return privateRequest<MemoryTransportReceipt>(
    accessToken,
    `/api/v1/memory/items/${encodeURIComponent(rootId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(command),
    },
  );
}

function requiredPublicValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new LifeOsApiError(0, `${name.toLowerCase()}_missing`);
  return normalized;
}

function normalizeApiOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LifeOsApiError(0, "api_configuration_invalid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new LifeOsApiError(0, "api_configuration_invalid");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new LifeOsApiError(0, "api_configuration_invalid");
  }
  return url.origin;
}

function apiBaseUrl(): string {
  return normalizeApiOrigin(
    requiredPublicValue(process.env.NEXT_PUBLIC_LIFE_OS_API_BASE_URL, "NEXT_PUBLIC_LIFE_OS_API_BASE_URL"),
  );
}

function bodyStatus(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const status = (value as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

async function jsonBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function privateRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!accessToken.trim()) throw new LifeOsApiError(401, "authentication_required");

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new LifeOsApiError(0, "network_unavailable");
  }

  const body = await jsonBody(response);
  if (!response.ok) {
    throw new LifeOsApiError(response.status, bodyStatus(body) ?? "request_failed");
  }
  return body as T;
}

export function createCapture(
  accessToken: string,
  rawText: string,
  idempotencyKey: string,
): Promise<CreateCaptureReceipt> {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  });
  return privateRequest<CreateCaptureReceipt>(accessToken, "/api/v1/captures", {
    method: "POST",
    headers,
    body: JSON.stringify({ rawText }),
  });
}

export function getCaptureReview(accessToken: string, captureId: string): Promise<CaptureProposalReview> {
  return privateRequest<CaptureProposalReview>(
    accessToken,
    `/api/v1/captures/${encodeURIComponent(captureId)}/review`,
  );
}

export function getBrainDumpOverview(accessToken: string): Promise<BrainDumpOverview> {
  return privateRequest<BrainDumpOverview>(accessToken, "/api/v1/brain-dump");
}

export function confirmBrainDumpClassification(
  accessToken: string,
  captureId: string,
  command: ConfirmBrainDumpClassificationCommand,
  idempotencyKey: string,
): Promise<BrainDumpClassificationTransportReceipt> {
  return privateRequest<BrainDumpClassificationTransportReceipt>(
    accessToken,
    `/api/v1/brain-dump/${encodeURIComponent(captureId)}/classification`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(command),
    },
  );
}

export function getNotNowOverview(accessToken: string): Promise<NotNowOverview> {
  return privateRequest<NotNowOverview>(accessToken, "/api/v1/not-now");
}

export function parkNotNowItem(
  accessToken: string,
  command: ParkNotNowItemCommand,
  idempotencyKey: string,
): Promise<NotNowItemTransportReceipt> {
  return privateRequest<NotNowItemTransportReceipt>(accessToken, "/api/v1/not-now", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(command),
  });
}

export function reviewNotNowItem(
  accessToken: string,
  rootId: string,
  command: ReviewNotNowItemCommand,
  idempotencyKey: string,
): Promise<NotNowItemTransportReceipt> {
  return privateRequest<NotNowItemTransportReceipt>(
    accessToken,
    `/api/v1/not-now/${encodeURIComponent(rootId)}/review`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(command),
    },
  );
}

export function getDriftOverview(accessToken: string): Promise<DriftOverview> {
  return privateRequest<DriftOverview>(accessToken, "/api/v1/drifts");
}

export function recordDrift(
  accessToken: string,
  command: RecordDriftCommand,
  idempotencyKey: string,
): Promise<DriftOccurrenceTransportReceipt> {
  return privateRequest<DriftOccurrenceTransportReceipt>(accessToken, "/api/v1/drifts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(command),
  });
}

export function confirmDriftUnderstanding(
  accessToken: string,
  driftId: string,
  command: ConfirmDriftUnderstandingCommand,
  idempotencyKey: string,
): Promise<DriftDecisionTransportReceipt> {
  return privateRequest<DriftDecisionTransportReceipt>(
    accessToken,
    `/api/v1/drifts/${encodeURIComponent(driftId)}/understanding`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(command),
    },
  );
}

export function recordDriftReturn(
  accessToken: string,
  driftId: string,
  command: RecordDriftReturnCommand,
  idempotencyKey: string,
): Promise<DriftDecisionTransportReceipt> {
  return privateRequest<DriftDecisionTransportReceipt>(
    accessToken,
    `/api/v1/drifts/${encodeURIComponent(driftId)}/return`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(command),
    },
  );
}

export function getJourneyPracticeOverview(
  accessToken: string,
): Promise<JourneyPracticeOverview> {
  return privateRequest<JourneyPracticeOverview>(accessToken, "/api/v1/journey");
}

export function activateJourney(
  accessToken: string,
  command: ActivateJourneyCommand,
  idempotencyKey: string,
): Promise<ActivateJourneyTransportReceipt> {
  return privateRequest<ActivateJourneyTransportReceipt>(accessToken, "/api/v1/journey/activate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(command),
  });
}

export function startJourneyPractice(
  accessToken: string,
  command: StartJourneyPracticeCommand,
  idempotencyKey: string,
): Promise<StartJourneyPracticeTransportReceipt> {
  return privateRequest<StartJourneyPracticeTransportReceipt>(
    accessToken,
    "/api/v1/journey/practice",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(command),
    },
  );
}

export function completeJourneyPractice(
  accessToken: string,
  sessionId: string,
  command: CompleteJourneyPracticeCommand,
  idempotencyKey: string,
): Promise<CompleteJourneyPracticeTransportReceipt> {
  return privateRequest<CompleteJourneyPracticeTransportReceipt>(
    accessToken,
    `/api/v1/journey/practice/${encodeURIComponent(sessionId)}/complete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(command),
    },
  );
}

export function getInteractionTrace(accessToken: string, captureId: string): Promise<InteractionChangeTrace> {
  return privateRequest<InteractionChangeTrace>(
    accessToken,
    `/api/v1/interactions/${encodeURIComponent(captureId)}/trace`,
  );
}

export function getCanonicalCalendar(
  accessToken: string,
  from: string,
  to: string,
): Promise<CanonicalCalendarWindow> {
  const query = new URLSearchParams({ from, to });
  return privateRequest<CanonicalCalendarWindow>(accessToken, `/api/v1/calendar?${query.toString()}`);
}

export function getDirectionOverview(accessToken: string): Promise<DirectionDecisionOverview> {
  return privateRequest<DirectionDecisionOverview>(accessToken, "/api/v1/direction");
}

export function getDailyReturnOverview(
  accessToken: string,
  localDate: string,
): Promise<DailyReturnOverview> {
  const query = new URLSearchParams({ date: localDate });
  return privateRequest<DailyReturnOverview>(
    accessToken,
    `/api/v1/daily-return?${query.toString()}`,
  );
}

export function appendDailyLogEntry(
  accessToken: string,
  command: AppendDailyLogEntryCommand,
  idempotencyKey: string,
): Promise<AppendDailyLogEntryReceipt> {
  return privateRequest<AppendDailyLogEntryReceipt>(
    accessToken,
    "/api/v1/daily-return/logs",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(command),
    },
  );
}

export function submitDailyReturnReview(
  accessToken: string,
  command: SubmitDailyReturnReviewCommand,
  idempotencyKey: string,
): Promise<SubmitDailyReturnReviewReceipt> {
  return privateRequest<SubmitDailyReturnReviewReceipt>(
    accessToken,
    "/api/v1/daily-return/review",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(command),
    },
  );
}

export function setCurrentDirection(
  accessToken: string,
  command: SetCurrentDirectionCommand,
  idempotencyKey: string,
): Promise<SetCurrentDirectionReceipt> {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  });
  return privateRequest<SetCurrentDirectionReceipt>(accessToken, "/api/v1/direction/current", {
    method: "POST",
    headers,
    body: JSON.stringify(command),
  });
}

export function confirmCalendarProposal(
  accessToken: string,
  proposalId: string,
  plan: ConfirmCalendarProposalInput,
): Promise<ConfirmCalendarProposalReceipt> {
  return privateRequest<ConfirmCalendarProposalReceipt>(
    accessToken,
    `/api/v1/proposals/${encodeURIComponent(proposalId)}/confirm-calendar`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    },
  );
}

/**
 * This helper is intentionally Calendar-specific. The backend only exposes a
 * reviewed canonical-apply implementation for READY_TO_APPLY Calendar create
 * proposals, and it independently revalidates the proposal before committing.
 */
export function applyCalendarProposal(accessToken: string, proposalId: string): Promise<ApplyProposalReceipt> {
  return privateRequest<ApplyProposalReceipt>(
    accessToken,
    `/api/v1/proposals/${encodeURIComponent(proposalId)}/apply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: { explicit: true } }),
    },
  );
}

export function rejectProposal(
  accessToken: string,
  proposalId: string,
  reason?: string,
): Promise<RejectProposalReceipt> {
  const body = reason?.trim() ? { reason: reason.trim() } : {};
  return privateRequest<RejectProposalReceipt>(
    accessToken,
    `/api/v1/proposals/${encodeURIComponent(proposalId)}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
