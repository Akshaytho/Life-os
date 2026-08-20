import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Pool } from "pg";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import { PostgresCanonicalCalendarReader } from "../../../packages/database/postgres-canonical-calendar-reader";
import { PostgresBrainDumpNotNowReader } from "../../../packages/database/postgres-brain-dump-not-now-reader";
import { PostgresBrainDumpNotNowUnitOfWork } from "../../../packages/database/postgres-brain-dump-not-now-unit-of-work";
import { PostgresDirectionDecisionReader } from "../../../packages/database/postgres-direction-decision-reader";
import { PostgresDirectionDecisionUnitOfWork } from "../../../packages/database/postgres-direction-decision-unit-of-work";
import { PostgresDailyReturnReader } from "../../../packages/database/postgres-daily-return-reader";
import { PostgresDailyReturnUnitOfWork } from "../../../packages/database/postgres-daily-return-unit-of-work";
import { PostgresDriftReader } from "../../../packages/database/postgres-drift-reader";
import { PostgresDriftUnitOfWork } from "../../../packages/database/postgres-drift-unit-of-work";
import { PostgresJourneyPracticeReader } from "../../../packages/database/postgres-journey-practice-reader";
import { PostgresJourneyPracticeUnitOfWork } from "../../../packages/database/postgres-journey-practice-unit-of-work";
import { PostgresPeriodicReviewReader } from "../../../packages/database/postgres-periodic-review-reader";
import { PostgresPeriodicReviewUnitOfWork } from "../../../packages/database/postgres-periodic-review-unit-of-work";
import { PostgresMemoryReader } from "../../../packages/database/postgres-memory-reader";
import { PostgresMemoryUnitOfWork } from "../../../packages/database/postgres-memory-unit-of-work";
import { PostgresInteractionChangeLedgerReader } from "../../../packages/database/postgres-interaction-change-ledger-reader";
import { PostgresProposalReviewReader } from "../../../packages/database/postgres-proposal-review-reader";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";
import type { LifeOsAssistant } from "../../../packages/intelligence/life-os-assistant";
import { aiRetrievalEnabledForRuntime, createLifeOsAssistantFromEnv } from "./ai-retrieval-runtime";
import { createCaptureInterpreterFromEnv } from "./capture-interpreter-runtime";
import { brainDumpNotNowEnabledForRuntime } from "./brain-dump-not-now-runtime";
import { dailyReturnEnabledForRuntime } from "./daily-return-runtime";
import { directionEnabledForRuntime } from "./direction-runtime";
import { driftEnabledForRuntime } from "./drift-runtime";
import { journeyPracticeEnabledForRuntime } from "./journey-practice-runtime";
import { periodicReviewsEnabledForRuntime } from "./periodic-reviews-runtime";
import { memoryEnabledForRuntime } from "./memory-runtime";
import type { PrivateApiDependencies } from "./private-api";
import { PostgresCalendarProposalConfirmationStore } from "./postgres-calendar-proposal-confirmation-store";
import { createSupabaseSessionVerifierFromEnv } from "./supabase-session-verifier";
import type { TechnicalTelemetrySink } from "./technical-telemetry";

export interface PrivateApiRuntimeOptions {
  sessionVerifier?: SessionVerifier;
  interpreter?: CaptureInterpreter;
  randomUuid?: () => string;
  now?: () => Date;
  monotonicNowMs?: () => number;
  directionEnabled?: boolean;
  dailyReturnEnabled?: boolean;
  brainDumpNotNowEnabled?: boolean;
  driftEnabled?: boolean;
  journeyPracticeEnabled?: boolean;
  aiRetrievalEnabled?: boolean;
  periodicReviewsEnabled?: boolean;
  memoryEnabled?: boolean;
  aiAssistant?: LifeOsAssistant;
}

function isoClock(now: () => Date) {
  return { now: () => now().toISOString() };
}

/**
 * Composes only ordinary private-request authority plus explicitly enabled reviewed
 * capabilities. The Pool supplied here must be the least-privileged application pool;
 * migration/admin credentials are intentionally not accepted by this API.
 */
export function createPrivateApiRuntimeDependencies(
  pool: Pool,
  env: NodeJS.ProcessEnv,
  runtime: RuntimeProvenance,
  telemetry: TechnicalTelemetrySink,
  options: PrivateApiRuntimeOptions = {},
): PrivateApiDependencies {
  const uuid = options.randomUuid ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const monotonicNowMs = options.monotonicNowMs ?? (() => performance.now());
  const clock = isoClock(now);
  const directionEnabled = options.directionEnabled ?? directionEnabledForRuntime(env, runtime);
  const dailyReturnEnabled = options.dailyReturnEnabled ?? dailyReturnEnabledForRuntime(env, runtime);
  const brainDumpNotNowEnabled = options.brainDumpNotNowEnabled
    ?? brainDumpNotNowEnabledForRuntime(env, runtime);
  const driftEnabled = options.driftEnabled ?? driftEnabledForRuntime(env, runtime);
  const journeyPracticeEnabled = options.journeyPracticeEnabled
    ?? journeyPracticeEnabledForRuntime(env, runtime);
  const aiRetrievalEnabled = options.aiRetrievalEnabled
    ?? aiRetrievalEnabledForRuntime(env, runtime);
  const periodicReviewsEnabled = options.periodicReviewsEnabled
    ?? periodicReviewsEnabledForRuntime(env, runtime);
  const memoryEnabled = options.memoryEnabled ?? memoryEnabledForRuntime(env, runtime);

  return {
    sessionVerifier: options.sessionVerifier ?? createSupabaseSessionVerifierFromEnv(env),
    transportClock: clock,
    requestIds: { next: () => `request-${uuid()}` },
    proposalReviewReader: new PostgresProposalReviewReader(pool),
    interactionLedgerReader: new PostgresInteractionChangeLedgerReader(pool),
    canonicalCalendarReader: new PostgresCanonicalCalendarReader(pool),
    unitOfWork: new PostgresWriteUnitOfWork(pool),
    calendarConfirmationStore: new PostgresCalendarProposalConfirmationStore(pool),
    interpreter: options.interpreter ?? createCaptureInterpreterFromEnv(env),
    captureClock: clock,
    routingIds: { next: (prefix) => `${prefix}-${uuid()}` },
    mutationClock: clock,
    applyIds: { next: (prefix) => `${prefix}-${uuid()}` },
    directionEnabled,
    ...(directionEnabled ? {
      directionReader: new PostgresDirectionDecisionReader(pool),
      directionUnitOfWork: new PostgresDirectionDecisionUnitOfWork(pool),
      directionClock: clock,
      directionIds: { next: (prefix: string) => `${prefix}-${uuid()}` },
    } : {}),
    dailyReturnEnabled,
    ...(dailyReturnEnabled ? {
      dailyReturnReader: new PostgresDailyReturnReader(pool),
      dailyReturnUnitOfWork: new PostgresDailyReturnUnitOfWork(pool),
      dailyReturnClock: clock,
      dailyReturnIds: { next: (prefix: string) => `${prefix}-${uuid()}` },
    } : {}),
    brainDumpNotNowEnabled,
    ...(brainDumpNotNowEnabled ? {
      brainDumpNotNowReader: new PostgresBrainDumpNotNowReader(pool),
      brainDumpNotNowUnitOfWork: new PostgresBrainDumpNotNowUnitOfWork(pool),
      brainDumpNotNowClock: clock,
      brainDumpNotNowIds: { next: (prefix: string) => `${prefix}-${uuid()}` },
    } : {}),
    driftEnabled,
    ...(driftEnabled ? {
      driftReader: new PostgresDriftReader(pool),
      driftUnitOfWork: new PostgresDriftUnitOfWork(pool),
      driftClock: clock,
      driftIds: { next: (prefix: string) => `${prefix}-${uuid()}` },
    } : {}),
    journeyPracticeEnabled,
    ...(journeyPracticeEnabled ? {
      journeyPracticeReader: new PostgresJourneyPracticeReader(pool),
      journeyPracticeUnitOfWork: new PostgresJourneyPracticeUnitOfWork(pool),
      journeyPracticeClock: clock,
      journeyPracticeIds: { next: (prefix: string) => `${prefix}-${uuid()}` },
    } : {}),
    aiRetrievalEnabled,
    ...(aiRetrievalEnabled ? {
      aiAssistant: options.aiAssistant ?? createLifeOsAssistantFromEnv(env, runtime)!,
      aiRetrievalClock: clock,
      directionReader: new PostgresDirectionDecisionReader(pool),
      dailyReturnReader: new PostgresDailyReturnReader(pool),
      brainDumpNotNowReader: new PostgresBrainDumpNotNowReader(pool),
      driftReader: new PostgresDriftReader(pool),
      journeyPracticeReader: new PostgresJourneyPracticeReader(pool),
    } : {}),
    periodicReviewsEnabled,
    ...(periodicReviewsEnabled ? {
      periodicReviewReader: new PostgresPeriodicReviewReader(pool),
      periodicReviewUnitOfWork: new PostgresPeriodicReviewUnitOfWork(pool),
      periodicReviewClock: clock,
      periodicReviewIds: { next: (prefix: string) => `${prefix}-${uuid()}` },
      dailyReturnReader: new PostgresDailyReturnReader(pool),
      canonicalCalendarReader: new PostgresCanonicalCalendarReader(pool),
      journeyPracticeReader: new PostgresJourneyPracticeReader(pool),
      driftReader: new PostgresDriftReader(pool),
      brainDumpNotNowReader: new PostgresBrainDumpNotNowReader(pool),
    } : {}),
    memoryEnabled,
    ...(memoryEnabled ? {
      memoryReader: new PostgresMemoryReader(pool),
      memoryUnitOfWork: new PostgresMemoryUnitOfWork(pool),
      memoryClock: clock,
      memoryIds: { next: (prefix: string) => `${prefix}-${uuid()}` },
    } : {}),
    runtime,
    telemetry,
    operationTimer: {
      nowMs: monotonicNowMs,
      nowIso: () => now().toISOString(),
    },
  };
}
