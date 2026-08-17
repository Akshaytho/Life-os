import { Pool } from "pg";
import {
  applyJourneyDatabaseRole,
  journeyDbRoleConfigurationFromEnv,
  JourneyDbRoleError,
  planJourneyDatabaseRole,
  revokeJourneyDatabaseRole,
} from "./journey-db-role";

type Mode = "plan" | "apply" | "revoke";

function requestedMode(argv: string[]): Mode {
  if (argv.length === 0) return "plan";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  if (argv.length === 1 && argv[0] === "--revoke") return "revoke";
  throw new JourneyDbRoleError(
    "Journey database role CLI accepts only optional --apply or --revoke",
    "CONFIGURATION_INVALID",
  );
}

async function main() {
  const mode = requestedMode(process.argv.slice(2));
  const configuration = journeyDbRoleConfigurationFromEnv(process.env);
  const pool = new Pool({ connectionString: configuration.migrationDatabaseUrl, max: 2 });
  try {
    const plan = mode === "apply"
      ? await applyJourneyDatabaseRole(pool, configuration.roleName)
      : mode === "revoke"
        ? await revokeJourneyDatabaseRole(pool, configuration.roleName)
        : await planJourneyDatabaseRole(pool, configuration.roleName);

    console.log(JSON.stringify({
      status: mode === "apply"
        ? "journey_role_applied"
        : mode === "revoke"
          ? "journey_role_revoked"
          : "journey_role_plan",
      environment: configuration.environment,
      roleName: plan.roleName,
      schemaName: plan.schemaName,
      migrationsPending: plan.migrationsPending,
      baselineRoleReady: plan.baselineRoleReady,
      tableExists: plan.tableExists,
      ready: plan.ready,
    }));
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const journeyError = error instanceof JourneyDbRoleError ? error : undefined;
  console.error(JSON.stringify({
    status: "journey_role_failed",
    errorCode: journeyError?.code ?? "JOURNEY_ROLE_APPLY_FAILED",
  }));
  process.exitCode = 1;
});
