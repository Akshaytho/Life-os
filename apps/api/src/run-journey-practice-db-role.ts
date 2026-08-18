import { Pool } from "pg";
import {
  applyJourneyPracticeDatabaseRole,
  journeyPracticeDbRoleConfigurationFromEnv,
  JourneyPracticeDbRoleError,
  planJourneyPracticeDatabaseRole,
  revokeJourneyPracticeDatabaseRole,
} from "./journey-practice-db-role";

type Mode = "plan" | "apply" | "revoke";

function requestedMode(argv: string[]): Mode {
  if (argv.length === 0) return "plan";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  if (argv.length === 1 && argv[0] === "--revoke") return "revoke";
  throw new JourneyPracticeDbRoleError(
    "Journey database role CLI accepts only optional --apply or --revoke",
    "CONFIGURATION_INVALID",
  );
}

async function main() {
  const mode = requestedMode(process.argv.slice(2));
  const configuration = journeyPracticeDbRoleConfigurationFromEnv(process.env);
  const pool = new Pool({ connectionString: configuration.migrationDatabaseUrl, max: 2 });
  try {
    const plan = mode === "apply"
      ? await applyJourneyPracticeDatabaseRole(pool, configuration.roleName)
      : mode === "revoke"
        ? await revokeJourneyPracticeDatabaseRole(pool, configuration.roleName)
        : await planJourneyPracticeDatabaseRole(pool, configuration.roleName);
    console.log(JSON.stringify({
      status: mode === "apply"
        ? "journey_practice_role_applied"
        : mode === "revoke"
          ? "journey_practice_role_revoked"
          : "journey_practice_role_plan",
      environment: configuration.environment,
      roleName: plan.roleName,
      schemaName: plan.schemaName,
      migrationsPending: plan.migrationsPending,
      baselineRoleReady: plan.baselineRoleReady,
      tableCount: plan.tableCount,
      leastPrivilegeTableCount: plan.leastPrivilegeTableCount,
      ready: plan.ready,
    }));
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const capabilityError = error instanceof JourneyPracticeDbRoleError ? error : undefined;
  console.error(JSON.stringify({
    status: "journey_practice_role_failed",
    errorCode: capabilityError?.code ?? "JOURNEY_ROLE_APPLY_FAILED",
  }));
  process.exitCode = 1;
});
