import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Pool } from "pg";
import type { RuntimeProvenance } from "../../../packages/contracts/runtime-provenance";
import { PostgresInteractionChangeLedgerReader } from "../../../packages/database/postgres-interaction-change-ledger-reader";
import { PostgresProposalReviewReader } from "../../../packages/database/postgres-proposal-review-reader";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";
import { SafeFallbackCaptureInterpreter } from "../../../packages/intelligence/safe-fallback-capture-interpreter";
import type { PrivateApiDependencies } from "./private-api";
import { createSupabaseSessionVerifierFromEnv } from "./supabase-session-verifier";
import type { TechnicalTelemetrySink } from "./technical-telemetry";

export interface PrivateApiRuntimeOptions {
  sessionVerifier?: SessionVerifier;
  interpreter?: CaptureInterpreter;
  randomUuid?: () => string;
  now?: () => Date;
  monotonicNowMs?: () => number;
}

function isoClock(now: () => Date) {
  return { now: () => now().toISOString() };
}

/**
 * Composes only ordinary private-request authority. The Pool supplied here must be the
 * least-privileged application pool; migration/admin credentials are intentionally not
 * accepted by this API.
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

  return {
    sessionVerifier: options.sessionVerifier ?? createSupabaseSessionVerifierFromEnv(env),
    transportClock: clock,
    requestIds: { next: () => `request-${uuid()}` },
    proposalReviewReader: new PostgresProposalReviewReader(pool),
    interactionLedgerReader: new PostgresInteractionChangeLedgerReader(pool),
    unitOfWork: new PostgresWriteUnitOfWork(pool),
    interpreter: options.interpreter ?? new SafeFallbackCaptureInterpreter(),
    captureClock: clock,
    routingIds: { next: (prefix) => `${prefix}-${uuid()}` },
    mutationClock: clock,
    applyIds: { next: (prefix) => `${prefix}-${uuid()}` },
    runtime,
    telemetry,
    operationTimer: {
      nowMs: monotonicNowMs,
      nowIso: () => now().toISOString(),
    },
  };
}
