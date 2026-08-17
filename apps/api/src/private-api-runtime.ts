import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Pool } from "pg";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import { PostgresCanonicalCalendarReader } from "../../../packages/database/postgres-canonical-calendar-reader";
import { PostgresDirectionDecisionReader } from "../../../packages/database/postgres-direction-decision-reader";
import { PostgresDirectionDecisionUnitOfWork } from "../../../packages/database/postgres-direction-decision-unit-of-work";
import { PostgresInteractionChangeLedgerReader } from "../../../packages/database/postgres-interaction-change-ledger-reader";
import { PostgresJourneyDecisionReader } from "../../../packages/database/postgres-journey-decision-reader";
import { PostgresJourneyDecisionUnitOfWork } from "../../../packages/database/postgres-journey-decision-unit-of-work";
import { PostgresProposalReviewReader } from "../../../packages/database/postgres-proposal-review-reader";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";
import { createCaptureInterpreterFromEnv } from "./capture-interpreter-runtime";
import { directionEnabledForRuntime } from "./direction-runtime";
import { journeyEnabledForRuntime } from "./journey-runtime";
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
  journeyEnabled?: boolean;
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
  const journeyEnabled = options.journeyEnabled ?? journeyEnabledForRuntime(env, runtime);

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
    journeyEnabled,
    ...(journeyEnabled ? {
      journeyReader: new PostgresJourneyDecisionReader(pool),
      journeyUnitOfWork: new PostgresJourneyDecisionUnitOfWork(pool),
      journeyClock: clock,
      journeyIds: { next: (prefix: string) => `${prefix}-${uuid()}` },
    } : {}),
    runtime,
    telemetry,
    operationTimer: {
      nowMs: monotonicNowMs,
      nowIso: () => now().toISOString(),
    },
  };
}
