import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Pool } from "pg";
import { applyCalendarPlanProposal } from "../apps/api/src/apply-calendar-plan-proposal";
import { buildBehaviorRegressionReport, summarizeBehaviorScenario } from "../apps/api/src/behavior-regression-report";
import { captureAndPropose } from "../apps/api/src/capture-and-propose";
import { getInteractionChangeTrace } from "../apps/api/src/get-interaction-change-trace";
import { rejectRoutingProposal } from "../apps/api/src/reject-routing-proposal";
import { resolveRuntimeProvenance } from "../apps/api/src/runtime-provenance";
import { PostgresInteractionChangeLedgerReader } from "../packages/database/postgres-interaction-change-ledger-reader";
import { PostgresWriteUnitOfWork } from "../packages/database/postgres-write-unit-of-work";
import type { WriteRequestContext } from "../packages/domain/write-boundary";
import type { CaptureInterpreter } from "../packages/intelligence/capture-interpreter";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for behavior regression generation");

const schema = "lifeos_behavior_regression";
const appRole = "lifeos_behavior_regression_app";
const appPassword = "synthetic_behavior_regression_only";
const reportPath = process.env.BEHAVIOR_REPORT_PATH?.trim() || "artifacts/behavior-regression.json";

const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
const ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
const appUrl = new URL(databaseUrl);
appUrl.username = appRole;
appUrl.password = appPassword;
const appPool = new Pool({ connectionString: appUrl.toString(), max: 4, options: `-c search_path=${schema}` });

function context(userId: string, requestId: string, receivedAt: string): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt,
    requestId,
  };
}

function ids(label: string) {
  let value = 0;
  return {
    next(prefix: string) {
      value += 1;
      return `${prefix}-${label}-${value}`;
    },
  };
}

function clockFrom(start: string) {
  let tick = 0;
  const startMs = Date.parse(start);
  return {
    now() {
      tick += 1;
      return new Date(startMs + tick * 1000).toISOString();
    },
  };
}

const tentativeInterpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "TENTATIVE",
      confidence: 0.8,
      observations: [
        { id: "certainty", label: "Certainty", value: "Synthetic tentative language", trustClass: "OBSERVATION" },
      ],
      clarification: "Synthetic clarification required",
      proposals: [
        {
          key: "synthetic-tentative-calendar",
          destination: "CALENDAR",
          operation: "CREATE_CALENDAR_PLAN",
          summary: "Synthetic tentative Calendar consequence",
          targetTrustClass: "FACT",
          approvalMode: "EXPLICIT_CONFIRMATION",
          state: "NEEDS_CONFIRMATION",
          reason: "Synthetic scenario remains tentative",
          payloadJson: {
            title: "Synthetic friend plan",
            category: "Friends",
            commitment: "Flexible",
          },
        },
      ],
    };
  },
};

const confirmedInterpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "CONFIRMED",
      confidence: 0.96,
      observations: [
        { id: "timing", label: "Timing", value: "Synthetic explicit timing", trustClass: "OBSERVATION" },
      ],
      proposals: [
        {
          key: "synthetic-confirmed-calendar",
          destination: "CALENDAR",
          operation: "CREATE_CALENDAR_PLAN",
          summary: "Synthetic confirmed Calendar consequence",
          targetTrustClass: "FACT",
          approvalMode: "REVIEW_AND_APPLY",
          state: "READY_TO_APPLY",
          reason: "Synthetic scenario has resolved Calendar fields",
          payloadJson: {
            title: "Synthetic gym",
            startsAt: "2026-08-14T19:00:00.000Z",
            endsAt: "2026-08-14T20:00:00.000Z",
            category: "Health",
            commitment: "Important",
          },
        },
      ],
    };
  },
};

async function resetPrivateTables() {
  await ownerPool.query(`
    TRUNCATE TABLE proposal_rejection, routing_proposal, routing_interpretation, capture_record,
      applied_proposal, domain_event, calendar_event CASCADE
  `);
}

async function setup() {
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.query(`CREATE SCHEMA ${schema}`);

  for (const file of [
    "0001_write_boundary.sql",
    "0002_capture_routing_proposal.sql",
    "0003_proposal_creation_provenance.sql",
    "0004_row_level_authorization.sql",
    "0005_proposal_rejection_provenance.sql",
  ]) {
    const sql = await readFile(`packages/database/migrations/${file}`, "utf8");
    await ownerPool.query(sql);
  }

  await adminPool.query(
    `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
  );
  await adminPool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${appRole}`);
  await adminPool.query(`GRANT EXECUTE ON FUNCTION ${schema}.lifeos_current_user_id() TO ${appRole}`);
}

async function cleanup() {
  await appPool.end();
  await ownerPool.end();
  await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
  await adminPool.end();
}

async function requireTrace(captureId: string, userId: string, reader: PostgresInteractionChangeLedgerReader) {
  const trace = await getInteractionChangeTrace(captureId, { actorType: "USER", userId }, { reader });
  if (!trace) throw new Error(`Synthetic behavior trace ${captureId} was unavailable`);
  return trace;
}

async function run() {
  await setup();
  const unitOfWork = new PostgresWriteUnitOfWork(appPool);
  const reader = new PostgresInteractionChangeLedgerReader(appPool);
  const scenarios = [];

  await resetPrivateTables();
  {
    const userId = "synthetic-user-tentative";
    const clock = clockFrom("2026-08-13T04:10:00.000Z");
    const receipt = await captureAndPropose(
      { rawText: "Synthetic tentative friend plan" },
      context(userId, "synthetic-request-tentative", "2026-08-13T04:09:00.000Z"),
      { unitOfWork, interpreter: tentativeInterpreter, clock, ids: ids("tentative") },
    );
    scenarios.push(summarizeBehaviorScenario(
      "tentative-calendar-needs-user",
      await requireTrace(receipt.captureId, userId, reader),
    ));
  }

  await resetPrivateTables();
  {
    const userId = "synthetic-user-approved";
    const clock = clockFrom("2026-08-13T04:21:00.000Z");
    const receipt = await captureAndPropose(
      { rawText: "Synthetic confirmed gym plan" },
      context(userId, "synthetic-request-approved", "2026-08-13T04:19:00.000Z"),
      { unitOfWork, interpreter: confirmedInterpreter, clock, ids: ids("approved-routing") },
    );
    await applyCalendarPlanProposal(
      { proposalId: receipt.proposalIds[0], confirmation: { explicit: true } },
      context(userId, "synthetic-apply-approved", "2026-08-13T04:21:00.000Z"),
      { unitOfWork, clock, ids: ids("approved-commit") },
    );
    scenarios.push(summarizeBehaviorScenario(
      "confirmed-calendar-approved",
      await requireTrace(receipt.captureId, userId, reader),
    ));
  }

  await resetPrivateTables();
  {
    const userId = "synthetic-user-rejected";
    const clock = clockFrom("2026-08-13T04:31:00.000Z");
    const receipt = await captureAndPropose(
      { rawText: "Synthetic tentative friend plan to reject" },
      context(userId, "synthetic-request-rejected", "2026-08-13T04:29:00.000Z"),
      { unitOfWork, interpreter: tentativeInterpreter, clock, ids: ids("rejected") },
    );
    await rejectRoutingProposal(
      { proposalId: receipt.proposalIds[0], reason: "Synthetic rejection feedback" },
      context(userId, "synthetic-reject", "2026-08-13T04:31:00.000Z"),
      { unitOfWork, clock },
    );
    scenarios.push(summarizeBehaviorScenario(
      "tentative-calendar-rejected",
      await requireTrace(receipt.captureId, userId, reader),
    ));
  }

  const runtime = resolveRuntimeProvenance(process.env);
  const report = buildBehaviorRegressionReport(runtime, new Date().toISOString(), scenarios);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.info(JSON.stringify({
    event: "BEHAVIOR_REGRESSION_REPORT_GENERATED",
    releaseSha: report.runtime.releaseSha,
    scenarioCount: report.scenarios.length,
    path: reportPath,
  }));
}

try {
  await run();
} finally {
  await cleanup();
}
