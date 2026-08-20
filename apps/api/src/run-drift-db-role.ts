import { Pool } from "pg";
import {
  applyDriftDatabaseRole,
  driftDbRoleConfigurationFromEnv,
  DriftDbRoleError,
  planDriftDatabaseRole,
  revokeDriftDatabaseRole,
} from "./drift-db-role";

type Mode = "plan" | "apply" | "revoke";

function requestedMode(argv: string[]): Mode {
  if (argv.length === 0) return "plan";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  if (argv.length === 1 && argv[0] === "--revoke") return "revoke";
  throw new DriftDbRoleError(
    "Drift database role CLI accepts only optional --apply or --revoke",
    "CONFIGURATION_INVALID",
  );
}

async function main() {
  const mode = requestedMode(process.argv.slice(2));
  const configuration = driftDbRoleConfigurationFromEnv(process.env);
  const pool = new Pool({ connectionString: configuration.migrationDatabaseUrl, max: 2 });
  try {
    const plan = mode === "apply"
      ? await applyDriftDatabaseRole(pool, configuration.roleName)
      : mode === "revoke"
        ? await revokeDriftDatabaseRole(pool, configuration.roleName)
        : await planDriftDatabaseRole(pool, configuration.roleName);
    console.log(JSON.stringify({
      status: mode === "apply"
        ? "drift_role_applied"
        : mode === "revoke"
          ? "drift_role_revoked"
          : "drift_role_plan",
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
  const capabilityError = error instanceof DriftDbRoleError ? error : undefined;
  console.error(JSON.stringify({
    status: "drift_role_failed",
    errorCode: capabilityError?.code ?? "DRIFT_ROLE_APPLY_FAILED",
  }));
  process.exitCode = 1;
});
