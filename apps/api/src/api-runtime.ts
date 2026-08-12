import type { Pool } from "pg";
import { resolveRuntimeProvenance } from "./runtime-provenance";
import type { ReadinessProbe } from "./api-health";

export class ApiRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiRuntimeConfigurationError";
  }
}

export interface DatabaseProbe {
  query(text: string): Promise<unknown>;
}

export function parsePort(value: string | undefined): number {
  const normalized = value?.trim() || "4000";
  if (!/^\d+$/.test(normalized)) throw new ApiRuntimeConfigurationError("PORT must be an integer between 1 and 65535");
  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ApiRuntimeConfigurationError("PORT must be an integer between 1 and 65535");
  }
  return port;
}

export function databaseUrlForRuntime(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.DATABASE_URL?.trim();
  if (value) return value;

  const environment = resolveRuntimeProvenance(env).environment;
  if (environment === "local") return undefined;
  throw new ApiRuntimeConfigurationError(`DATABASE_URL is required in ${environment}`);
}

export function createDatabaseReadinessProbe(database: DatabaseProbe | undefined): ReadinessProbe {
  if (!database) {
    return { async check() { return true; } };
  }

  return {
    async check() {
      await database.query("SELECT 1");
      return true;
    },
  };
}

export async function closePool(pool: Pick<Pool, "end"> | undefined): Promise<void> {
  if (pool) await pool.end();
}
