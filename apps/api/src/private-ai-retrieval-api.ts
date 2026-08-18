import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AiInteractionMode,
  AskLifeOsCommand,
} from "../../../packages/contracts/ai-retrieval";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import type { BrainDumpNotNowReader } from "../../../packages/domain/brain-dump-not-now-read";
import type { CanonicalCalendarReader } from "../../../packages/domain/canonical-calendar-read";
import type { DailyReturnReader } from "../../../packages/domain/daily-return-read";
import type { DirectionDecisionReader } from "../../../packages/domain/direction-read";
import type { DriftReader } from "../../../packages/domain/drift-return-read";
import type { JourneyPracticeReader } from "../../../packages/domain/journey-practice-read";
import type { MemoryReader } from "../../../packages/domain/memory-read";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
} from "../../../packages/domain/trusted-transport-auth";
import type { LifeOsAssistant } from "../../../packages/intelligence/life-os-assistant";
import { OpenAiLifeOsAssistantError } from "../../../packages/intelligence/openai-life-os-assistant";
import { AiRetrievalError, askLifeOs, type AiRetrievalClock } from "./ask-life-os";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
} from "./create-trusted-web-request-context";
import { appendVaryHeader } from "./private-cors";
import type { OperationTimer } from "./run-instrumented-operation";
import { runInstrumentedOperation } from "./run-instrumented-operation";
import type { TechnicalTelemetrySink } from "./technical-telemetry";

const MAX_BODY_BYTES = 24 * 1024;

export interface PrivateAiRetrievalApiDependencies {
  sessionVerifier: SessionVerifier;
  transportClock: TransportClock;
  requestIds: TransportRequestIdGenerator;
  aiAssistant?: LifeOsAssistant;
  aiRetrievalClock?: AiRetrievalClock;
  directionReader?: DirectionDecisionReader;
  canonicalCalendarReader?: CanonicalCalendarReader;
  dailyReturnReader?: DailyReturnReader;
  brainDumpNotNowReader?: BrainDumpNotNowReader;
  driftReader?: DriftReader;
  journeyPracticeReader?: JourneyPracticeReader;
  memoryReader?: MemoryReader;
  runtime: RuntimeProvenance;
  telemetry: TechnicalTelemetrySink;
  operationTimer: OperationTimer;
}

class AiRetrievalRequestError extends Error {}

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

function bearerCredential(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.length > 4096) return undefined;
  return /^Bearer ([^\s,]+)$/.exec(header)?.[1];
}

function requireJsonContentType(request: IncomingMessage) {
  const encoding = request.headers["content-encoding"];
  if (encoding !== undefined && encoding !== "identity") throw new AiRetrievalRequestError();
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string"
    || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
  ) throw new AiRetrievalRequestError();
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new AiRetrievalRequestError();
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new AiRetrievalRequestError();
  }
}

function commandFromBody(body: Record<string, unknown>): AskLifeOsCommand {
  const expected = ["calendarFrom", "calendarTo", "localDate", "mode", "question", "timeZone"].sort();
  const actual = Object.keys(body).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new AiRetrievalRequestError();
  }
  if (expected.some((key) => typeof body[key] !== "string")) {
    throw new AiRetrievalRequestError();
  }
  return {
    mode: body.mode as AiInteractionMode,
    question: body.question as string,
    localDate: body.localDate as string,
    timeZone: body.timeZone as string,
    calendarFrom: body.calendarFrom as string,
    calendarTo: body.calendarTo as string,
  };
}

function retrievalDependenciesReady(
  dependencies: PrivateAiRetrievalApiDependencies,
): dependencies is PrivateAiRetrievalApiDependencies & Required<Pick<
  PrivateAiRetrievalApiDependencies,
  | "aiAssistant"
  | "aiRetrievalClock"
  | "directionReader"
  | "canonicalCalendarReader"
  | "dailyReturnReader"
  | "brainDumpNotNowReader"
  | "driftReader"
  | "journeyPracticeReader"
>> {
  return Boolean(
    dependencies.aiAssistant
    && dependencies.aiRetrievalClock
    && dependencies.directionReader
    && dependencies.canonicalCalendarReader
    && dependencies.dailyReturnReader
    && dependencies.brainDumpNotNowReader
    && dependencies.driftReader
    && dependencies.journeyPracticeReader,
  );
}

export async function handlePrivateAiRetrievalRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: PrivateAiRetrievalApiDependencies,
): Promise<void> {
  try {
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://life-os.invalid");
    } catch {
      throw new AiRetrievalRequestError();
    }
    if (url.pathname !== "/api/v1/ask" || [...url.searchParams.keys()].length > 0) {
      json(response, 404, { status: "not_found" });
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      json(response, 405, { status: "method_not_allowed" });
      return;
    }
    const context = await createTrustedWebRequestContext(
      { credential: bearerCredential(request) },
      {
        sessionVerifier: dependencies.sessionVerifier,
        clock: dependencies.transportClock,
        requestIds: dependencies.requestIds,
      },
    );
    if (!retrievalDependenciesReady(dependencies)) {
      json(response, 503, { status: "ai_unavailable" });
      return;
    }
    requireJsonContentType(request);
    const command = commandFromBody(await readBody(request));
    const value = await runInstrumentedOperation({
      operation: "ASK_LIFE_OS",
      runtime: dependencies.runtime,
      telemetry: dependencies.telemetry,
      timer: dependencies.operationTimer,
      initialTrace: { requestId: context.requestId },
      async work() {
        return {
          value: await askLifeOs(command, context.principal, {
            assistant: dependencies.aiAssistant,
            directionReader: dependencies.directionReader,
            calendarReader: dependencies.canonicalCalendarReader,
            dailyReturnReader: dependencies.dailyReturnReader,
            brainDumpNotNowReader: dependencies.brainDumpNotNowReader,
            driftReader: dependencies.driftReader,
            journeyPracticeReader: dependencies.journeyPracticeReader,
            ...(dependencies.memoryReader ? { memoryReader: dependencies.memoryReader } : {}),
            clock: dependencies.aiRetrievalClock,
          }),
        };
      },
      classifyFailure(error) {
        if (error instanceof AiRetrievalError) {
          return {
            outcome: error.code === "CONTEXT_UNAVAILABLE" ? "REJECTED" : "FAILED",
            errorCode: error.code,
          };
        }
        if (error instanceof OpenAiLifeOsAssistantError) {
          return { outcome: "UNAVAILABLE", errorCode: error.code };
        }
        return { outcome: "FAILED", errorCode: "AI_RETRIEVAL_FAILED" };
      },
    });
    json(response, 200, value);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      json(response, 401, { status: "authentication_required" });
      return;
    }
    if (error instanceof AuthenticationUnavailableError) {
      json(response, 503, { status: "authentication_unavailable" });
      return;
    }
    if (error instanceof AiRetrievalRequestError) {
      json(response, 400, { status: "invalid_request" });
      return;
    }
    if (error instanceof AiRetrievalError) {
      if (error.code === "CONTEXT_UNAVAILABLE") {
        json(response, 409, { status: "context_unavailable" });
        return;
      }
      if (error.code === "INVALID_REQUEST" || error.code === "INVALID_PRINCIPAL") {
        json(response, 400, { status: "invalid_request" });
        return;
      }
      json(response, 502, { status: "ai_response_invalid" });
      return;
    }
    if (error instanceof OpenAiLifeOsAssistantError) {
      if (error.code === "PROVIDER_UNAVAILABLE") {
        json(response, 503, { status: "ai_unavailable" });
        return;
      }
      json(response, 502, { status: "ai_response_invalid" });
      return;
    }
    json(response, 500, { status: "internal_error" });
  }
}
