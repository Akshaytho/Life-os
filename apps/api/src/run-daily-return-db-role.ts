import { Pool } from "pg";
import {
  applyDailyReturnDatabaseRole,
  dailyReturnDbRoleConfigurationFromEnv,
  DailyReturnDbRoleError,
  planDailyReturnDatabaseRole,
  revokeDailyReturnDatabaseRole,
} from "./daily-return-db-role";

type Mode = "plan" | "apply" | "revoke";

function requestedMode(argv: string[]): Mode {
  if (argv.length === 0) return "plan";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  if (argv.length === 1 && argv[0] === "--revoke") return "revoke";
  throw new DailyReturnDbRoleError(
    "Daily Return database role CLI accepts only optional --apply or --revoke",
    "CONFIGURATION_INVALID",
  );
}

async function main() {
  const mode = requestedMode(process.argv.slice(2));
  const configuration = dailyReturnDbRoleConfigurationFromEnv(process.env);
  const pool = new Pool({
    connectionString: configuration.migrationDatabaseUrl,
    max: 2,
  });
  try {
    const plan = mode === "apply"
      ? await applyDailyReturnDatabaseRole(pool, configuration.roleName)
      : mode === "revoke"
        ? await revokeDailyReturnDatabaseRole(pool, configuration.roleName)
        : await planDailyReturnDatabaseRole(pool, configuration.roleName);

    console.log(JSON.stringify({
      status: mode === "apply"
        ? "daily_return_role_applied"
        : mode === "revoke"
          ? "daily_return_role_revoked"
          : "daily_return_role_plan",
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
  const dailyReturnError = error instanceof DailyReturnDbRoleError ? error : undefined;
  console.error(JSON.stringify({
    status: "daily_return_role_failed",
    errorCode: dailyReturnError?.code ?? "DAILY_RETURN_ROLE_APPLY_FAILED",
  }));
  process.exitCode = 1;
});
