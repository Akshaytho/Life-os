import { once } from "node:events";
import { Pool } from "pg";
import { createLifeOsHealthServer } from "./api-health";
import { closePool, createDatabaseReadinessProbe, databaseUrlForRuntime, parsePort } from "./api-runtime";
import { resolveRuntimeProvenance } from "./runtime-provenance";

async function main() {
  const provenance = resolveRuntimeProvenance(process.env);
  const port = parsePort(process.env.PORT);
  const databaseUrl = databaseUrlForRuntime(process.env);
  const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : undefined;
  const readiness = createDatabaseReadinessProbe(pool);
  const server = createLifeOsHealthServer({ provenance, readiness });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    // Safe technical metadata only. Never log process.env or DATABASE_URL here.
    console.info(JSON.stringify({
      event: "API_SHUTDOWN",
      signal,
      environment: provenance.environment,
      releaseSha: provenance.releaseSha,
    }));

    server.close();
    await once(server, "close");
    await closePool(pool);
  };

  server.on("error", async (error) => {
    console.error(JSON.stringify({
      event: "API_SERVER_ERROR",
      errorName: error.name,
      environment: provenance.environment,
      releaseSha: provenance.releaseSha,
    }));
    await closePool(pool);
    process.exitCode = 1;
  });

  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });

  server.listen(port, "0.0.0.0");
  await once(server, "listening");

  console.info(JSON.stringify({
    event: "API_STARTED",
    port,
    environment: provenance.environment,
    releaseSha: provenance.releaseSha,
    platform: provenance.platform,
    serviceName: provenance.serviceName,
  }));
}

void main().catch((error: unknown) => {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  console.error(JSON.stringify({ event: "API_STARTUP_FAILED", errorName }));
  process.exitCode = 1;
});
