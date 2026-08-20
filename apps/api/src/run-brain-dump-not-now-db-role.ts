import { Pool } from "pg";
import {
  applyBrainDumpNotNowDatabaseRole,
  brainDumpNotNowDbRoleConfigurationFromEnv,
  BrainDumpNotNowDbRoleError,
  planBrainDumpNotNowDatabaseRole,
  revokeBrainDumpNotNowDatabaseRole,
} from "./brain-dump-not-now-db-role";

type Mode = "plan" | "apply" | "revoke";

function requestedMode(argv: string[]): Mode {
  if (argv.length === 0) return "plan";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  if (argv.length === 1 && argv[0] === "--revoke") return "revoke";
  throw new BrainDumpNotNowDbRoleError(
    "Brain Dump + NOT NOW database role CLI accepts only optional --apply or --revoke",
    "CONFIGURATION_INVALID",
  );
}

async function main() {
  const mode = requestedMode(process.argv.slice(2));
  const configuration = brainDumpNotNowDbRoleConfigurationFromEnv(process.env);
  const pool = new Pool({ connectionString: configuration.migrationDatabaseUrl, max: 2 });
  try {
    const plan = mode === "apply"
      ? await applyBrainDumpNotNowDatabaseRole(pool, configuration.roleName)
      : mode === "revoke"
        ? await revokeBrainDumpNotNowDatabaseRole(pool, configuration.roleName)
        : await planBrainDumpNotNowDatabaseRole(pool, configuration.roleName);
    console.log(JSON.stringify({
      status: mode === "apply"
        ? "brain_dump_not_now_role_applied"
        : mode === "revoke"
          ? "brain_dump_not_now_role_revoked"
          : "brain_dump_not_now_role_plan",
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
  const capabilityError = error instanceof BrainDumpNotNowDbRoleError ? error : undefined;
  console.error(JSON.stringify({
    status: "brain_dump_not_now_role_failed",
    errorCode: capabilityError?.code ?? "BRAIN_DUMP_NOT_NOW_ROLE_APPLY_FAILED",
  }));
  process.exitCode = 1;
});
