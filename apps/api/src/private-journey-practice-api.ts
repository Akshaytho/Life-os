import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ActivateJourneyCommand,
  CompleteJourneyPracticeCommand,
  JourneyCapabilityCode,
  JourneyCode,
  SoundDesignTechniqueCode,
  StartJourneyPracticeCommand,
} from "../../../packages/contracts/journey-practice";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type {
  JourneyPracticeClock,
  JourneyPracticeIdGenerator,
  JourneyPracticeUnitOfWork,
} from "../../../packages/domain/journey-practice";
import type { JourneyPracticeReader } from "../../../packages/domain/journey-practice-read";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import { activateJourney } from "./activate-journey";
import { completeJourneyPractice } from "./complete-journey-practice";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import { getJourneyPracticeOverview } from "./get-journey-practice-overview";
import { JourneyPracticeError } from "./journey-practice-validation";
import { appendVaryHeader } from "./private-cors";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import { startJourneyPractice } from "./start-journey-practice";
import type { TechnicalTelemetrySink } from "./technical-telemetry";
import {
  WebWriteIdempotencyError,
  withWebWriteIdempotency,
  type WebWriteIdempotencyScope,
} from "./web-write-idempotency";

const MAX_BODY_BYTES = 24 * 1024;

export interface PrivateJourneyPracticeApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  journeyPracticeReader?: JourneyPracticeReader;
  journeyPracticeUnitOfWork?: JourneyPracticeUnitOfWork;
  journeyPracticeClock?: JourneyPracticeClock;
  journeyPracticeIds?: JourneyPracticeIdGenerator;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class JourneyPracticeRequestError extends Error {}

type Route =
  | { kind: "OVERVIEW" }
  | { kind: "ACTIVATE" }
  | { kind: "START" }
  | { kind: "COMPLETE"; sessionId: string };

function json(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("pragma", "no-cache");
  appendVaryHeader(response, "Authorization");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.end(JSON.stringify(payload));
}

function decodedPathId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new JourneyPracticeRequestError();
  }
}

function routeOf(request: IncomingMessage): Route | undefined {
  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://life-os.invalid");
  } catch {
    throw new JourneyPracticeRequestError();
  }
  if ([...url.searchParams.keys()].length > 0) throw new JourneyPracticeRequestError();
  if (url.pathname === "/api/v1/journey") return { kind: "OVERVIEW" };
  if (url.pathname === "/api/v1/journey/activate") return { kind: "ACTIVATE" };
  if (url.pathname === "/api/v1/journey/practice") return { kind: "START" };
  const complete = /^\/api\/v1\/journey\/practice\/([^/]+)\/complete$/.exec(url.pathname);
  return complete ? { kind: "COMPLETE", sessionId: decodedPathId(complete[1]!) } : undefined;
}

function expectedMethod(route: Route): "GET" | "POST" {
  return route.kind === "OVERVIEW" ? "GET" : "POST";
}

function bearerCredential(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.length > 4096) return undefined;
  return /^Bearer ([^\s,]+)$/.exec(header)?.[1];
}

function idempotencyKey(request: IncomingMessage): string | undefined {
  const header = request.headers["idempotency-key"];
  return typeof header === "string" ? header : undefined;
}

function requireJsonContentType(request: IncomingMessage) {
  const encoding = request.headers["content-encoding"];
  if (encoding !== undefined && encoding !== "identity") throw new JourneyPracticeRequestError();
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string"
    || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
  ) throw new JourneyPracticeRequestError();
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new JourneyPracticeRequestError();
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new JourneyPracticeRequestError();
  }
}

function exactKeys(body: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(body).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new JourneyPracticeRequestError();
  }
}

function activationCommand(body: Record<string, unknown>): ActivateJourneyCommand {
  const optional = body.decisionReason === undefined ? [] : ["decisionReason"];
  exactKeys(body, ["journeyCode", "capabilityCode", "startingTechnique", ...optional]);
  if (
    typeof body.journeyCode !== "string"
    || typeof body.capabilityCode !== "string"
    || typeof body.startingTechnique !== "string"
    || (body.decisionReason !== undefined && typeof body.decisionReason !== "string")
  ) throw new JourneyPracticeRequestError();
  return {
    journeyCode: body.journeyCode as JourneyCode,
    capabilityCode: body.capabilityCode as JourneyCapabilityCode,
    startingTechnique: body.startingTechnique as SoundDesignTechniqueCode,
    ...(typeof body.decisionReason === "string" ? { decisionReason: body.decisionReason } : {}),
  };
}

function startCommand(body: Record<string, unknown>): StartJourneyPracticeCommand {
  const optional = body.experimentIntention === undefined ? [] : ["experimentIntention"];
  exactKeys(body, ["technique", ...optional]);
  if (
    typeof body.technique !== "string"
    || (body.experimentIntention !== undefined && typeof body.experimentIntention !== "string")
  ) throw new JourneyPracticeRequestError();
  return {
    technique: body.technique as SoundDesignTechniqueCode,
    ...(typeof body.experimentIntention === "string"
      ? { experimentIntention: body.experimentIntention }
      : {}),
  };
}

function completeCommand(body: Record<string, unknown>): CompleteJourneyPracticeCommand {
  const optional = ["reflectionNote", "retainedLearningCandidate"].filter(
    (key) => body[key] !== undefined,
  );
  exactKeys(body, optional);
  if (optional.some((key) => typeof body[key] !== "string")) {
    throw new JourneyPracticeRequestError();
  }
  return {
    ...(typeof body.reflectionNote === "string" ? { reflectionNote: body.reflectionNote } : {}),
    ...(typeof body.retainedLearningCandidate === "string"
      ? { retainedLearningCandidate: body.retainedLearningCandidate }
      : {}),
  };
}

function writeScope(route: Exclude<Route, { kind: "OVERVIEW" }>): WebWriteIdempotencyScope {
  if (route.kind === "ACTIVATE") return "JOURNEY_ACTIVATE";
  if (route.kind === "START") return "JOURNEY_PRACTICE_START";
  return "JOURNEY_PRACTICE_COMPLETE";
}

function mapDomainError(error: JourneyPracticeError, response: ServerResponse) {
  if (error.code === "PRACTICE_SESSION_NOT_FOUND") {
    json(response, 404, { status: "not_found" });
    return;
  }
  const conflicts = new Map([
    ["IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["JOURNEY_ALREADY_ACTIVATED", "journey_already_activated"],
    ["OPEN_PRACTICE_SESSION_EXISTS", "open_practice_session_exists"],
    ["PRACTICE_SESSION_ALREADY_COMPLETED", "practice_session_already_completed"],
  ]);
  const conflict = conflicts.get(error.code);
  if (conflict) {
    json(response, 409, { status: conflict });
    return;
  }
  if (error.code === "JOURNEY_ACTIVATION_REQUIRED") {
    json(response, 409, { status: "journey_activation_required" });
    return;
  }
  if (error.code === "IDEMPOTENCY_REQUIRED") {
    json(response, 400, { status: "idempotency_required" });
    return;
  }
  json(response, 400, { status: "invalid_journey_practice" });
}

export async function handlePrivateJourneyPracticeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateJourneyPracticeApiDependencies,
): Promise<void> {
  try {
    const route = routeOf(request);
    if (!route) {
      json(response, 404, { status: "not_found" });
      return;
    }
    const method = expectedMethod(route);
    if (request.method !== method) {
      response.setHeader("allow", method);
      json(response, 405, { status: "method_not_allowed" });
      return;
    }
    const transportContext = await createTrustedWebRequestContext(
      { credential: bearerCredential(request) },
      {
        sessionVerifier: dependencies.sessionVerifier,
        clock: dependencies.transportClock,
        requestIds: dependencies.requestIds,
      },
    );
    if (route.kind === "OVERVIEW") {
      if (!dependencies.journeyPracticeReader) {
        json(response, 503, { status: "journey_unavailable" });
        return;
      }
      const value = await runInstrumentedOperation({
        operation: "GET_JOURNEY_PRACTICE_OVERVIEW",
        runtime: dependencies.runtime,
        telemetry: dependencies.telemetry,
        timer: dependencies.operationTimer,
        initialTrace: { requestId: transportContext.requestId },
        async work() {
          return {
            value: await getJourneyPracticeOverview(
              transportContext.principal.userId,
              dependencies.journeyPracticeReader!,
            ),
          };
        },
        classifyFailure(error) {
          return error instanceof JourneyPracticeError
            ? { outcome: "REJECTED", errorCode: error.code }
            : { outcome: "FAILED", errorCode: "JOURNEY_READ_FAILED" };
        },
      });
      json(response, 200, value);
      return;
    }
    const unitOfWork = dependencies.journeyPracticeUnitOfWork;
    const clock = dependencies.journeyPracticeClock;
    const ids = dependencies.journeyPracticeIds;
    if (!unitOfWork || !clock || !ids) {
      json(response, 503, { status: "journey_mutation_unavailable" });
      return;
    }
    requireJsonContentType(request);
    const body = await readBody(request);
    const context = withWebWriteIdempotency(
      transportContext,
      writeScope(route),
      idempotencyKey(request),
    );
    const operation = route.kind === "ACTIVATE"
      ? "ACTIVATE_JOURNEY_CAPABILITY"
      : route.kind === "START"
        ? "START_JOURNEY_PRACTICE"
        : "COMPLETE_JOURNEY_PRACTICE";
    const receipt = await runInstrumentedOperation({
      operation,
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId },
      async work() {
        const value = route.kind === "ACTIVATE"
          ? await activateJourney(activationCommand(body), context, { unitOfWork, clock, ids })
          : route.kind === "START"
            ? await startJourneyPractice(startCommand(body), context, { unitOfWork, clock, ids })
            : await completeJourneyPractice(
              route.sessionId,
              completeCommand(body),
              context,
              { unitOfWork, clock, ids },
            );
        return { value };
      },
      classifyFailure(error) {
        return error instanceof JourneyPracticeError
          ? { outcome: "REJECTED", errorCode: error.code }
          : { outcome: "FAILED", errorCode: "JOURNEY_WRITE_FAILED" };
      },
    });
    json(response, 200, {
      ...receipt,
      status: receipt.idempotentReplay ? "replayed" : "recorded",
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      json(response, 401, { status: "authentication_required" });
      return;
    }
    if (error instanceof AuthenticationUnavailableError) {
      json(response, 503, { status: "authentication_unavailable" });
      return;
    }
    if (error instanceof JourneyPracticeRequestError) {
      json(response, 400, { status: "invalid_request" });
      return;
    }
    if (error instanceof WebWriteIdempotencyError) {
      json(response, 400, { status: "idempotency_required" });
      return;
    }
    if (error instanceof JourneyPracticeError) {
      mapDomainError(error, response);
      return;
    }
    json(response, 500, { status: "internal_error" });
  }
}
