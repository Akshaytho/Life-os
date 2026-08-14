import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import { PostgresInteractionChangeLedgerReader } from "../../../packages/database/postgres-interaction-change-ledger-reader";
import { PostgresProposalReviewReader } from "../../../packages/database/postgres-proposal-review-reader";
import { PostgresWriteUnitOfWork } from "../../../packages/database/postgres-write-unit-of-work";
import type { IdGenerator, RoutingIdGenerator } from "../../../packages/domain/write-boundary";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import type { CaptureInterpreter, CaptureInterpreterInput } from "../../../packages/intelligence/capture-interpreter";
import { createPrivateDatabaseReadinessProbe } from "./api-runtime";
import { createLifeOsApiServer } from "./api-server";
import { createLifeOsPrivateApiServer } from "./private-api";
import { createPrivateApiRuntimeDependencies } from "./private-api-runtime";

const schema = "private_api_composition_test";
const appRole = "lifeos_private_api_composition_app";
const appPassword = "lifeos_private_api_composition_password";

class TokenVerifier implements SessionVerifier {
  async verify(value: string) {
    if (value === "owner-session") return { userId: "owner-user" };
    if (value === "other-session") return { userId: "other-user" };
    return undefined;
  }
}

class RoutingIds implements RoutingIdGenerator {
  private value = 0;
  next(prefix: "capture" | "interpretation" | "proposal") {
    this.value += 1;
    return `${prefix}-private-api-${this.value}`;
  }
}

class ApplyIds implements IdGenerator {
  private calendar = 0;
  private event = 0;
  next(prefix: "calendar" | "event") {
    if (prefix === "calendar") return `calendar-private-api-${++this.calendar}`;
    return `event-private-api-${++this.event}`;
  }
}

const interpreter: CaptureInterpreter = {
  async interpret(input: CaptureInterpreterInput) {
    const shouldCommit = input.rawText.includes("commit flow");
    return {
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: shouldCommit ? "CONFIRMED" as const : "TENTATIVE" as const,
      confidence: shouldCommit ? 0.94 : 0.76,
      observations: [{
        id: "route",
        label: "Route",
        value: shouldCommit ? "Synthetic commit candidate" : "Synthetic review candidate",
        trustClass: "OBSERVATION" as const,
      }],
      clarification: shouldCommit ? undefined : "Keep this plan?",
      proposals: [shouldCommit
        ? {
            key: "commit-calendar",
            destination: "CALENDAR" as const,
            operation: "CREATE_CALENDAR_PLAN" as const,
            summary: "Create synthetic gym plan",
            targetTrustClass: "FACT" as const,
            approvalMode: "REVIEW_AND_APPLY" as const,
            state: "READY_TO_APPLY" as const,
            reason: "Explicit synthetic plan",
            payloadJson: {
              title: "Synthetic gym",
              startsAt: "2026-08-15T13:00:00.000Z",
              endsAt: "2026-08-15T14:00:00.000Z",
              category: "Health",
              commitment: "Important",
            },
          }
        : {
            key: "reject-calendar",
            destination: "CALENDAR" as const,
            operation: "CREATE_CALENDAR_PLAN" as const,
            summary: "Review synthetic social plan",
            targetTrustClass: "FACT" as const,
            approvalMode: "EXPLICIT_CONFIRMATION" as const,
            state: "NEEDS_CONFIRMATION" as const,
            reason: "Tentative synthetic wording",
            payloadJson: {
              title: "Synthetic social plan",
              category: "Friends",
              commitment: "Flexible",
            },
          }],
    };
  },
};

export class PrivateApiPostgresFixture {
  readonly adminPool: Pool;
  readonly ownerPool: Pool;
  readonly appPool: Pool;
  readonly telemetry: TechnicalTelemetryEvent[] = [];
  private requestId = 0;
  private operationMs = 1000;
  private captureRecorded = 0;

  constructor(databaseUrl: string) {
    this.adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    this.ownerPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
    const appUrl = new URL(databaseUrl);
    appUrl.username = appRole;
    appUrl.password = appPassword;
    this.appPool = new Pool({ connectionString: appUrl.toString(), max: 6, options: `-c search_path=${schema}` });
  }

  async setup() {
    await this.adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await this.adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
    await this.adminPool.query(`CREATE SCHEMA ${schema}`);

    for (const file of [
      "0001_write_boundary.sql",
      "0002_capture_routing_proposal.sql",
      "0003_proposal_creation_provenance.sql",
      "0004_row_level_authorization.sql",
      "0005_proposal_rejection_provenance.sql",
      "0006_safe_fallback_interpreter.sql",
    ]) {
      const migration = await readFile(`packages/database/migrations/${file}`, "utf8");
      await this.ownerPool.query(migration);
    }

    await this.adminPool.query(
      `CREATE ROLE ${appRole} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await this.adminPool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${appRole}`);
    await this.adminPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${appRole}`);
    await this.adminPool.query(`GRANT EXECUTE ON FUNCTION ${schema}.lifeos_current_user_id() TO ${appRole}`);
  }

  async reset() {
    this.telemetry.length = 0;
    await this.ownerPool.query(`
      TRUNCATE TABLE proposal_rejection, routing_proposal, routing_interpretation, capture_record,
        applied_proposal, domain_event, calendar_event CASCADE
    `);
  }

  async teardown() {
    await this.appPool.end();
    await this.ownerPool.end();
    await this.adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await this.adminPool.query(`DROP ROLE IF EXISTS ${appRole}`);
    await this.adminPool.end();
  }

  private async listen(server: ReturnType<typeof createLifeOsPrivateApiServer>) {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      close: async () => {
        server.close();
        await once(server, "close");
      },
    };
  }

  async startServer(captureInterpreter: CaptureInterpreter = interpreter) {
    const unitOfWork = new PostgresWriteUnitOfWork(this.appPool);
    const server = createLifeOsPrivateApiServer({
      sessionVerifier: new TokenVerifier(),
      transportClock: { now: () => "2026-08-14T02:00:00.000Z" },
      requestIds: { next: () => `private-api-request-${++this.requestId}` },
      proposalReviewReader: new PostgresProposalReviewReader(this.appPool),
      interactionLedgerReader: new PostgresInteractionChangeLedgerReader(this.appPool),
      unitOfWork,
      interpreter: captureInterpreter,
      captureClock: {
        now: () => new Date(Date.parse("2026-08-14T02:00:00.000Z") + ++this.captureRecorded * 1000).toISOString(),
      },
      routingIds: new RoutingIds(),
      mutationClock: { now: () => "2026-08-14T02:00:05.000Z" },
      applyIds: new ApplyIds(),
      runtime: { environment: "ci", releaseSha: "private-api-composition", platform: "CI" },
      telemetry: { emit: (event) => { this.telemetry.push(structuredClone(event)); } },
      operationTimer: {
        nowMs: () => { this.operationMs += 5; return this.operationMs; },
        nowIso: () => "2026-08-14T02:00:06.000Z",
      },
    });

    return this.listen(server);
  }

  async startComposedRuntimeServer() {
    const runtime = { environment: "ci" as const, releaseSha: "private-runtime-composition", platform: "CI" as const };
    const readiness = createPrivateDatabaseReadinessProbe(this.appPool);
    if (!(await readiness.check())) throw new Error("Synthetic application role did not satisfy private runtime readiness");

    let uuid = 0;
    let monotonic = 2000;
    const privateApi = createPrivateApiRuntimeDependencies(
      this.appPool,
      {},
      runtime,
      { emit: (event) => { this.telemetry.push(structuredClone(event)); } },
      {
        sessionVerifier: new TokenVerifier(),
        randomUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
        now: () => new Date("2026-08-14T02:10:00.000Z"),
        monotonicNowMs: () => ++monotonic,
      },
    );

    return this.listen(createLifeOsApiServer({
      health: { provenance: runtime, readiness },
      privateApi,
    }));
  }
}

export function authHeaders(session = "owner-session") {
  return { authorization: `Bearer ${session}` };
}

export function captureRequest(rawText: string, key: string): RequestInit {
  return {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ rawText }),
  };
}

export function actionRequest(body: unknown, session = "owner-session"): RequestInit {
  return {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
