import { once } from "node:events";
import { Pool } from "pg";
import { createLifeOsApiServer } from "./api-server";
import {
  ApiRuntimeConfigurationError,
  closePool,
  createDatabaseReadinessProbe,
  createPrivateDatabaseReadinessProbe,
  parsePort,
  privateApiEnabledForRuntime,
} from "./api-runtime";
import { safeBootstrapDiagnosticCode, safeBootstrapErrorClass } from "./bootstrap-error";
import { createAiRetrievalDatabaseReadinessProbe } from "./ai-retrieval-database-readiness";
import { aiRetrievalEnabledForRuntime } from "./ai-retrieval-runtime";
import { createBrainDumpNotNowDatabaseReadinessProbe } from "./brain-dump-not-now-database-readiness";
import { brainDumpNotNowEnabledForRuntime } from "./brain-dump-not-now-runtime";
import { databasePoolConfigurationFromEnv } from "./database-runtime";
import { createDailyReturnDatabaseReadinessProbe } from "./daily-return-database-readiness";
import { dailyReturnEnabledForRuntime } from "./daily-return-runtime";
import {
  combineReadinessProbes,
  createDirectionDatabaseReadinessProbe,
} from "./direction-database-readiness";
import { directionEnabledForRuntime } from "./direction-runtime";
import { createDriftDatabaseReadinessProbe } from "./drift-database-readiness";
import { driftEnabledForRuntime } from "./drift-runtime";
import { createJourneyPracticeDatabaseReadinessProbe } from "./journey-practice-database-readiness";
import { journeyPracticeEnabledForRuntime } from "./journey-practice-runtime";
import { createPeriodicReviewsDatabaseReadinessProbe } from "./periodic-reviews-database-readiness";
import { periodicReviewsEnabledForRuntime } from "./periodic-reviews-runtime";
import { privateCorsPolicyFromEnv } from "./private-cors";
import { createPrivateApiRuntimeDependencies } from "./private-api-runtime";
import { resolveRuntimeProvenance } from "./runtime-provenance";
import { createConsoleTechnicalTelemetrySink } from "./technical-telemetry";

async function main() {
  const provenance = resolveRuntimeProvenance(process.env);
  const telemetry = createConsoleTechnicalTelemetrySink();
  const now = () => new Date().toISOString();
  const port = parsePort(process.env.PORT);
  const privateApiEnabled = privateApiEnabledForRuntime(process.env, provenance);
  const directionEnabled = directionEnabledForRuntime(process.env, provenance);
  const dailyReturnEnabled = dailyReturnEnabledForRuntime(process.env, provenance);
  const brainDumpNotNowEnabled = brainDumpNotNowEnabledForRuntime(process.env, provenance);
  const driftEnabled = driftEnabledForRuntime(process.env, provenance);
  const journeyPracticeEnabled = journeyPracticeEnabledForRuntime(process.env, provenance);
  const aiRetrievalEnabled = aiRetrievalEnabledForRuntime(process.env, provenance);
  const periodicReviewsEnabled = periodicReviewsEnabledForRuntime(process.env, provenance);
  // The database transport contract, including which certificate authority is trusted, is
  // owned by the reviewed runtime configuration rather than assembled here.
  const databaseConfiguration = databasePoolConfigurationFromEnv(process.env);
  const pool = databaseConfiguration ? new Pool(databaseConfiguration) : undefined;

  if (privateApiEnabled && !pool) {
    throw new ApiRuntimeConfigurationError("DATABASE_URL is required when the private API is enabled");
  }

  const baselineReadiness = privateApiEnabled
    ? createPrivateDatabaseReadinessProbe(pool!)
    : createDatabaseReadinessProbe(pool);
  const readiness = combineReadinessProbes(
    baselineReadiness,
    ...(directionEnabled ? [createDirectionDatabaseReadinessProbe(pool!)] : []),
    ...(dailyReturnEnabled ? [createDailyReturnDatabaseReadinessProbe(pool!)] : []),
    ...(brainDumpNotNowEnabled ? [createBrainDumpNotNowDatabaseReadinessProbe(pool!)] : []),
    ...(driftEnabled ? [createDriftDatabaseReadinessProbe(pool!)] : []),
    ...(journeyPracticeEnabled ? [createJourneyPracticeDatabaseReadinessProbe(pool!)] : []),
    ...(aiRetrievalEnabled ? [createAiRetrievalDatabaseReadinessProbe(pool!)] : []),
    ...(periodicReviewsEnabled ? [createPeriodicReviewsDatabaseReadinessProbe(pool!)] : []),
  );

  const privateApi = privateApiEnabled
    ? createPrivateApiRuntimeDependencies(pool!, process.env, provenance, telemetry, {
        directionEnabled,
        dailyReturnEnabled,
        brainDumpNotNowEnabled,
        driftEnabled,
        journeyPracticeEnabled,
        aiRetrievalEnabled,
        periodicReviewsEnabled,
      })
    : undefined;
  const privateCors = privateApiEnabled ? privateCorsPolicyFromEnv(process.env) : undefined;

  // Do not listen with a private surface when the connected application role cannot
  // prove every explicitly enabled RLS/ownership boundary. Direction adds a separate
  // narrower readiness proof only when its high-authority flag is true. Daily Return
  // follows the same explicit capability boundary with its own RLS/grant proof.
  if (privateApiEnabled && !(await readiness.check())) {
    throw new ApiRuntimeConfigurationError("Private API database authorization readiness failed");
  }

  const server = createLifeOsApiServer({
    health: { provenance, readiness },
    privateApi,
    privateCors,
  });

  let shuttingDown = false;
  const shutdown = async (signal: "SIGTERM" | "SIGINT") => {
    if (shuttingDown) return;
    shuttingDown = true;

    telemetry.emit({
      timestamp: now(),
      level: "INFO",
      component: "API",
      runtime: provenance,
      kind: "RUNTIME_LIFECYCLE",
      event: "STOPPING",
      signal,
    });

    server.close();
    await once(server, "close");
    await closePool(pool);
  };

  server.on("error", async () => {
    telemetry.emit({
      timestamp: now(),
      level: "ERROR",
      component: "API",
      runtime: provenance,
      kind: "RUNTIME_LIFECYCLE",
      event: "SERVER_FAILED",
      errorCode: "HTTP_SERVER_ERROR",
    });
    await closePool(pool);
    process.exitCode = 1;
  });

  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });

  server.listen(port, "0.0.0.0");
  await once(server, "listening");

  telemetry.emit({
    timestamp: now(),
    level: "INFO",
    component: "API",
    runtime: provenance,
    kind: "RUNTIME_LIFECYCLE",
    event: "STARTED",
  });
}

void main().catch((error: unknown) => {
  // Bootstrap can fail before RuntimeProvenance is valid. Emit only validated class/code
  // tokens; messages and stacks can contain provider URLs, credentials or certificate details.
  const diagnosticCode = safeBootstrapDiagnosticCode(error);
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "ERROR",
    component: "API",
    event: "API_BOOTSTRAP_FAILED",
    errorCode: "BOOTSTRAP_FAILED",
    errorClass: safeBootstrapErrorClass(error),
    ...(diagnosticCode ? { diagnosticCode } : {}),
  }));
  process.exitCode = 1;
});
