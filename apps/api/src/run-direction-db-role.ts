import { Pool } from "pg";
import {
  applyDirectionDatabaseRole,
  directionDbRoleConfigurationFromEnv,
  DirectionDbRoleError,
  planDirectionDatabaseRole,
  revokeDirectionDatabaseRole,
} from "./direction-db-role";

type Mode = "plan" | "apply" | "revoke";

function requestedMode(argv: string[]): Mode {
  if (argv.length === 0) return "plan";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  if (argv.length === 1 && argv[0] === "--revoke") return "revoke";
  throw new DirectionDbRoleError(
    "Direction database role CLI accepts only optional --apply or --revoke",
    "CONFIGURATION_INVALID",
  );
}

async function main() {
  const mode = requestedMode(process.argv.slice(2));
  const configuration = directionDbRoleConfigurationFromEnv(process.env);
  // Revoke can inspect migration state while holding one scoped client, so keep a
  // second administrative connection available rather than deadlocking a max=1 pool.
  const pool = new Pool({ connectionString: configuration.migrationDatabaseUrl, max: 2 });
  try {
    const plan = mode === "apply"
      ? await applyDirectionDatabaseRole(pool, configuration.roleName)
      : mode === "revoke"
        ? await revokeDirectionDatabaseRole(pool, configuration.roleName)
        : await planDirectionDatabaseRole(pool, configuration.roleName);

    console.log(JSON.stringify({
      status: mode === "apply"
        ? "direction_role_applied"
        : mode === "revoke"
          ? "direction_role_revoked"
          : "direction_role_plan",
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
  const directionError = error instanceof DirectionDbRoleError ? error : undefined;
  console.error(JSON.stringify({
    status: "direction_role_failed",
    errorCode: directionError?.code ?? "DIRECTION_ROLE_APPLY_FAILED",
  }));
  process.exitCode = 1;
});
