import type {
  CreateManualCalendarCommitmentCommand,
  ManualCalendarCommitmentReceipt,
} from "../../../packages/contracts/manual-calendar";
import { LifeOsApiError } from "./life-os-api";

function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_LIFE_OS_API_BASE_URL?.trim();
  if (!raw) throw new LifeOsApiError(0, "next_public_life_os_api_base_url_missing");
  let url: URL;
  try { url = new URL(raw); } catch { throw new LifeOsApiError(0, "api_configuration_invalid"); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new LifeOsApiError(0, "api_configuration_invalid");
  }
  return url.origin;
}

function statusOf(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const status = (value as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

export async function createManualCalendarCommitment(
  accessToken: string,
  command: CreateManualCalendarCommitmentCommand,
  idempotencyKey: string,
): Promise<ManualCalendarCommitmentReceipt> {
  if (!accessToken.trim()) throw new LifeOsApiError(401, "authentication_required");
  let response: Response;
  try {
    response = await fetch(`${apiOrigin()}/api/v1/calendar/commitments`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(command),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new LifeOsApiError(0, "network_unavailable");
  }

  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  if (!response.ok) throw new LifeOsApiError(response.status, statusOf(body) ?? "request_failed");
  return body as ManualCalendarCommitmentReceipt;
}
