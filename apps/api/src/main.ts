import { once } from "node:events";
import { Pool } from "pg";
import { createLifeOsHealthServer } from "./api-health";
import { closePool, createDatabaseReadinessProbe, databaseUrlForRuntime, parsePort } from "./api-runtime";
import { resolveRuntimeProvenance } from "./runtime-provenance";
import { createConsoleTechnicalTelemetrySink } from "./technical-telemetry";

async function main() {
  const provenance = resolveRuntimeProvenance(process.env);
  const telemetry = createConsoleTechnicalTelemetrySink();
  const now = () => new Date().toISOString();
  const port = parsePort(process.env.PORT);
  const databaseUrl = databaseUrlForRuntime(process.env);
  const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;
  const readiness = createDatabaseReadinessProbe(pool);
  const server = createLifeOsHealthServer({ provenance, readiness });

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

void main().catch(() => {
  // Bootstrap can fail before RuntimeProvenance is valid. Do not invent runtime
  // identity or echo provider/configuration errors just to make the failure verbose.
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "ERROR",
    component: "API",
    event: "API_BOOTSTRAP_FAILED",
    errorCode: "BOOTSTRAP_FAILED",
  }));
  process.exitCode = 1;
});
