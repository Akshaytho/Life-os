import { Pool } from "pg";
import {
  ApplicationDbRoleError,
  applicationDbRoleApplyConfigurationFromEnv,
  applicationDbRolePlanConfigurationFromEnv,
  applyApplicationDatabaseRole,
  planApplicationDatabaseRole,
} from "./application-db-role";

function requestedMode(argv: string[]): "plan" | "apply" {
  if (argv.length === 0) return "plan";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  throw new ApplicationDbRoleError(
    "Application database role CLI accepts only optional --apply",
    "CONFIGURATION_INVALID",
  );
}

async function runPlan() {
  const configuration = applicationDbRolePlanConfigurationFromEnv(process.env);
  const pool = new Pool({ connectionString: configuration.migrationDatabaseUrl, max: 1 });
  try {
    const plan = await planApplicationDatabaseRole(pool, configuration.roleName);
    console.log(JSON.stringify({
      status: "application_role_plan",
      environment: configuration.environment,
      roleName: plan.roleName,
      schemaName: plan.schemaName,
      migrationsPending: plan.migrationsPending,
      roleExists: plan.roleExists,
      ready: plan.ready,
    }));
  } finally {
    await pool.end();
  }
}

async function runApply() {
  const configuration = applicationDbRoleApplyConfigurationFromEnv(process.env);
  const pool = new Pool({ connectionString: configuration.migrationDatabaseUrl, max: 1 });
  try {
    const receipt = await applyApplicationDatabaseRole(
      pool,
      configuration.roleName,
      configuration.password,
    );
    console.log(JSON.stringify({
      status: "application_role_applied",
      environment: configuration.environment,
      roleName: receipt.roleName,
      schemaName: receipt.schemaName,
      ready: receipt.ready,
    }));
  } finally {
    await pool.end();
  }
}

async function main() {
  const mode = requestedMode(process.argv.slice(2));
  if (mode === "plan") {
    await runPlan();
    return;
  }
  await runApply();
}

void main().catch((error: unknown) => {
  const applicationRoleError = error instanceof ApplicationDbRoleError ? error : undefined;
  console.error(JSON.stringify({
    status: "application_role_failed",
    errorCode: applicationRoleError?.code ?? "ROLE_APPLY_FAILED",
  }));
  process.exitCode = 1;
});
