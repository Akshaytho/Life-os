import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { handlePrivateCalendarConfirmationRequest, type PrivateCalendarConfirmationApiDependencies } from "./private-calendar-confirmation-api";
import { handlePrivateCaptureRequest, type PrivateCaptureApiDependencies } from "./private-capture-api";
import { appendVaryHeader } from "./private-cors";
import { handlePrivateProposalActionRequest, type PrivateProposalActionsApiDependencies } from "./private-proposal-actions-api";
import { handlePrivateReadRequest, type PrivateReadApiDependencies } from "./private-read-api";

export type PrivateApiDependencies =
  & PrivateReadApiDependencies
  & PrivateCaptureApiDependencies
  & PrivateProposalActionsApiDependencies
  & PrivateCalendarConfirmationApiDependencies;

function jsonNotFound(response: ServerResponse) {
  response.statusCode = 404;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("pragma", "no-cache");
  appendVaryHeader(response, "Authorization");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.end(JSON.stringify({ status: "not_found" }));
}

function pathOf(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://life-os.invalid").pathname;
  } catch {
    return "/invalid-request-target";
  }
}

function routeFamily(path: string): "CAPTURE" | "READ" | "CALENDAR_CONFIRMATION" | "PROPOSAL_ACTION" | undefined {
  if (path === "/api/v1/captures") return "CAPTURE";
  if (path === "/api/v1/calendar") return "READ";
  if (/^\/api\/v1\/captures\/[^/]+\/review$/.test(path)) return "READ";
  if (/^\/api\/v1\/interactions\/[^/]+\/trace$/.test(path)) return "READ";
  if (/^\/api\/v1\/proposals\/[^/]+\/confirm-calendar$/.test(path)) return "CALENDAR_CONFIRMATION";
  if (/^\/api\/v1\/proposals\/[^/]+\/(apply|reject)$/.test(path)) return "PROPOSAL_ACTION";
  return undefined;
}

export async function handlePrivateApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateApiDependencies,
): Promise<void> {
  switch (routeFamily(pathOf(request))) {
    case "CAPTURE":
      await handlePrivateCaptureRequest(request, response, dependencies);
      return;
    case "READ":
      await handlePrivateReadRequest(request, response, dependencies);
      return;
    case "CALENDAR_CONFIRMATION":
      await handlePrivateCalendarConfirmationRequest(request, response, dependencies);
      return;
    case "PROPOSAL_ACTION":
      await handlePrivateProposalActionRequest(request, response, dependencies);
      return;
    default:
      jsonNotFound(response);
  }
}

export function createLifeOsPrivateApiServer(dependencies: PrivateApiDependencies): Server {
  return createServer((request, response) => {
    void handlePrivateApiRequest(request, response, dependencies);
  });
}
