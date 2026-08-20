import { Pool } from "pg";
import {
  applyPeriodicReviewsDatabaseRole,
  periodicReviewsDbRoleConfigurationFromEnv,
  PeriodicReviewsDbRoleError,
  planPeriodicReviewsDatabaseRole,
  revokePeriodicReviewsDatabaseRole,
} from "./periodic-reviews-db-role";

type Mode = "plan" | "apply" | "revoke";

function modeOf(argv: string[]): Mode {
  if (argv.length === 0) return "plan";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  if (argv.length === 1 && argv[0] === "--revoke") return "revoke";
  throw new PeriodicReviewsDbRoleError(
    "Periodic Reviews database role CLI accepts only optional --apply or --revoke",
    "CONFIGURATION_INVALID",
  );
}

async function main() {
  const mode = modeOf(process.argv.slice(2));
  const configuration = periodicReviewsDbRoleConfigurationFromEnv(process.env);
  const pool = new Pool({ connectionString: configuration.migrationDatabaseUrl, max: 2 });
  try {
    const plan = mode === "apply"
      ? await applyPeriodicReviewsDatabaseRole(pool, configuration.roleName)
      : mode === "revoke"
        ? await revokePeriodicReviewsDatabaseRole(pool, configuration.roleName)
        : await planPeriodicReviewsDatabaseRole(pool, configuration.roleName);
    console.log(JSON.stringify({
      status: mode === "apply" ? "periodic_reviews_role_applied"
        : mode === "revoke" ? "periodic_reviews_role_revoked" : "periodic_reviews_role_plan",
      environment: configuration.environment,
      roleName: plan.roleName,
      schemaName: plan.schemaName,
      migrationsPending: plan.migrationsPending,
      baselineRoleReady: plan.baselineRoleReady,
      tableExists: plan.tableExists,
      leastPrivilege: plan.leastPrivilege,
      ready: plan.ready,
    }));
  } finally { await pool.end() }
}

void main().catch((error: unknown) => {
  const value = error instanceof PeriodicReviewsDbRoleError ? error : undefined;
  console.error(JSON.stringify({ status: "periodic_reviews_role_failed", errorCode: value?.code ?? "APPLY_FAILED" }));
  process.exitCode = 1;
});
