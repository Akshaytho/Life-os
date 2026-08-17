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
import { databasePoolConfigurationFromEnv } from "./database-runtime";
import {
  combineReadinessProbes,
  createDirectionDatabaseReadinessProbe,
} from "./direction-database-readiness";
import { directionEnabledForRuntime } from "./direction-runtime";
import { createJourneyDatabaseReadinessProbe } from "./journey-database-readiness";
import { journeyEnabledForRuntime } from "./journey-runtime";
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
  const journeyEnabled = journeyEnabledForRuntime(process.env, provenance);
  const databaseConfiguration = databasePoolConfigurationFromEnv(process.env);
  const pool = databaseConfiguration ? new Pool(databaseConfiguration) : undefined;

  if (privateApiEnabled && !pool) {
    throw new ApiRuntimeConfigurationError("DATABASE_URL is required when the private API is enabled");
  }

  const baselineReadiness = privateApiEnabled
    ? createPrivateDatabaseReadinessProbe(pool!)
    : createDatabaseReadinessProbe(pool);
  const readinessProbes = [baselineReadiness];
  if (directionEnabled) readinessProbes.push(createDirectionDatabaseReadinessProbe(pool!));
  if (journeyEnabled) readinessProbes.push(createJourneyDatabaseReadinessProbe(pool!));
  const readiness = readinessProbes.length === 1
    ? baselineReadiness
    : combineReadinessProbes(...readinessProbes);

  const privateApi = privateApiEnabled
    ? createPrivateApiRuntimeDependencies(pool!, process.env, provenance, telemetry, { directionEnabled, journeyEnabled })
    : undefined;
  const privateCors = privateApiEnabled ? privateCorsPolicyFromEnv(process.env) : undefined;

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
