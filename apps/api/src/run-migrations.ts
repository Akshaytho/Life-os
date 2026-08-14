import { Pool } from "pg";
import {
  applyDatabaseMigrations,
  MigrationRunnerError,
  migrationRuntimeConfigurationFromEnv,
  planDatabaseMigrations,
} from "./migration-runner";

function requestedMode(argv: string[]): "plan" | "apply" {
  if (argv.length === 0) return "plan";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  throw new MigrationRunnerError("Migration CLI accepts only optional --apply", "CONFIGURATION_INVALID");
}

async function main() {
  const mode = requestedMode(process.argv.slice(2));
  const configuration = migrationRuntimeConfigurationFromEnv(process.env);
  const pool = new Pool({ connectionString: configuration.migrationDatabaseUrl, max: 1 });

  try {
    if (mode === "plan") {
      const plan = await planDatabaseMigrations(pool);
      console.log(JSON.stringify({
        status: "migration_plan",
        environment: configuration.environment,
        alreadyApplied: plan.alreadyApplied,
        pending: plan.pending,
      }));
      return;
    }

    const receipt = await applyDatabaseMigrations(pool);
    console.log(JSON.stringify({
      status: "migrations_applied",
      environment: configuration.environment,
      alreadyApplied: receipt.alreadyApplied,
      appliedNow: receipt.appliedNow,
      pending: receipt.pending,
    }));
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const migrationError = error instanceof MigrationRunnerError ? error : undefined;
  console.error(JSON.stringify({
    status: "migration_failed",
    errorCode: migrationError?.code ?? "MIGRATION_FAILED",
  }));
  process.exitCode = 1;
});
