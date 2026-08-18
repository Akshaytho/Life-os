import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { handlePrivateCalendarConfirmationRequest, type PrivateCalendarConfirmationApiDependencies } from "./private-calendar-confirmation-api";
import { handlePrivateCaptureRequest, type PrivateCaptureApiDependencies } from "./private-capture-api";
import { appendVaryHeader } from "./private-cors";
import { handlePrivateAiRetrievalRequest, type PrivateAiRetrievalApiDependencies } from "./private-ai-retrieval-api";
import { handlePrivateBrainDumpNotNowRequest, type PrivateBrainDumpNotNowApiDependencies } from "./private-brain-dump-not-now-api";
import { handlePrivateDailyReturnRequest, type PrivateDailyReturnApiDependencies } from "./private-daily-return-api";
import { handlePrivateDirectionRequest, type PrivateDirectionApiDependencies } from "./private-direction-api";
import { handlePrivateDriftRequest, type PrivateDriftApiDependencies } from "./private-drift-api";
import { handlePrivateJourneyPracticeRequest, type PrivateJourneyPracticeApiDependencies } from "./private-journey-practice-api";
import { handlePrivatePeriodicReviewsRequest, type PrivatePeriodicReviewsApiDependencies } from "./private-periodic-reviews-api";
import { handlePrivateProposalActionRequest, type PrivateProposalActionsApiDependencies } from "./private-proposal-actions-api";
import { handlePrivateReadRequest, type PrivateReadApiDependencies } from "./private-read-api";

export type PrivateApiDependencies =
  & PrivateReadApiDependencies
  & PrivateCaptureApiDependencies
  & PrivateProposalActionsApiDependencies
  & PrivateCalendarConfirmationApiDependencies
  & PrivateDirectionApiDependencies
  & PrivateDailyReturnApiDependencies
  & PrivateBrainDumpNotNowApiDependencies
  & PrivateDriftApiDependencies
  & PrivateJourneyPracticeApiDependencies
  & PrivateAiRetrievalApiDependencies
  & PrivatePeriodicReviewsApiDependencies
  & {
    directionEnabled?: boolean;
    dailyReturnEnabled?: boolean;
    brainDumpNotNowEnabled?: boolean;
    driftEnabled?: boolean;
    journeyPracticeEnabled?: boolean;
    aiRetrievalEnabled?: boolean;
    periodicReviewsEnabled?: boolean;
  };

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

type RouteFamily = "CAPTURE" | "READ" | "CALENDAR_CONFIRMATION" | "PROPOSAL_ACTION" | "DIRECTION" | "DAILY_RETURN" | "BRAIN_DUMP_NOT_NOW" | "DRIFT" | "JOURNEY_PRACTICE" | "AI_RETRIEVAL" | "PERIODIC_REVIEWS";

function routeFamily(
  path: string,
  directionEnabled: boolean,
  dailyReturnEnabled: boolean,
  brainDumpNotNowEnabled: boolean,
  driftEnabled: boolean,
  journeyPracticeEnabled: boolean,
  aiRetrievalEnabled: boolean,
  periodicReviewsEnabled: boolean,
): RouteFamily | undefined {
  if (path === "/api/v1/captures") return "CAPTURE";
  if (path === "/api/v1/calendar") return "READ";
  if (/^\/api\/v1\/captures\/[^/]+\/review$/.test(path)) return "READ";
  if (/^\/api\/v1\/interactions\/[^/]+\/trace$/.test(path)) return "READ";
  if (/^\/api\/v1\/proposals\/[^/]+\/confirm-calendar$/.test(path)) return "CALENDAR_CONFIRMATION";
  if (/^\/api\/v1\/proposals\/[^/]+\/(apply|reject)$/.test(path)) return "PROPOSAL_ACTION";
  if (directionEnabled && (path === "/api/v1/direction" || path === "/api/v1/direction/current")) return "DIRECTION";
  if (dailyReturnEnabled && (
    path === "/api/v1/daily-return"
    || path === "/api/v1/daily-return/logs"
    || path === "/api/v1/daily-return/review"
  )) return "DAILY_RETURN";
  if (brainDumpNotNowEnabled && (
    path === "/api/v1/brain-dump"
    || /^\/api\/v1\/brain-dump\/[^/]+\/classification$/.test(path)
    || path === "/api/v1/not-now"
    || /^\/api\/v1\/not-now\/[^/]+\/review$/.test(path)
  )) return "BRAIN_DUMP_NOT_NOW";
  if (driftEnabled && (
    path === "/api/v1/drifts"
    || /^\/api\/v1\/drifts\/[^/]+\/(understanding|return)$/.test(path)
  )) return "DRIFT";
  if (journeyPracticeEnabled && (
    path === "/api/v1/journey"
    || path === "/api/v1/journey/activate"
    || path === "/api/v1/journey/practice"
    || /^\/api\/v1\/journey\/practice\/[^/]+\/complete$/.test(path)
  )) return "JOURNEY_PRACTICE";
  if (aiRetrievalEnabled && path === "/api/v1/ask") return "AI_RETRIEVAL";
  if (periodicReviewsEnabled && path === "/api/v1/reviews/period") return "PERIODIC_REVIEWS";
  return undefined;
}

export async function handlePrivateApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateApiDependencies,
): Promise<void> {
  switch (routeFamily(
    pathOf(request),
    dependencies.directionEnabled === true,
    dependencies.dailyReturnEnabled === true,
    dependencies.brainDumpNotNowEnabled === true,
    dependencies.driftEnabled === true,
    dependencies.journeyPracticeEnabled === true,
    dependencies.aiRetrievalEnabled === true,
    dependencies.periodicReviewsEnabled === true,
  )) {
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
    case "DIRECTION":
      await handlePrivateDirectionRequest(request, response, dependencies);
      return;
    case "DAILY_RETURN":
      await handlePrivateDailyReturnRequest(request, response, dependencies);
      return;
    case "BRAIN_DUMP_NOT_NOW":
      await handlePrivateBrainDumpNotNowRequest(request, response, dependencies);
      return;
    case "DRIFT":
      await handlePrivateDriftRequest(request, response, dependencies);
      return;
    case "JOURNEY_PRACTICE":
      await handlePrivateJourneyPracticeRequest(request, response, dependencies);
      return;
    case "AI_RETRIEVAL":
      await handlePrivateAiRetrievalRequest(request, response, dependencies);
      return;
    case "PERIODIC_REVIEWS":
      await handlePrivatePeriodicReviewsRequest(request, response, dependencies);
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
