import type { InteractionChangeTrace } from "../../../packages/contracts/interaction-change-ledger";
import type { ProposalState } from "../../../packages/contracts/input-routing";
import type { CaptureProposalReview } from "../../../packages/contracts/proposal-review";

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

export function getInteractionTrace(accessToken: string, captureId: string): Promise<InteractionChangeTrace> {
  return privateRequest<InteractionChangeTrace>(
    accessToken,
    `/api/v1/interactions/${encodeURIComponent(captureId)}/trace`,
  );
}
