import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import type {
  JourneyDecisionDomainEventRecord,
  JourneyDecisionRecord,
  JourneyDecisionTransaction,
  JourneyDecisionUnitOfWork,
} from "../../../packages/domain/journey-decision";
import type {
  JourneyDecisionReader,
  JourneyDecisionReadRecord,
} from "../../../packages/domain/journey-read";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import {
  createLifeOsPrivateJourneyServer,
  type PrivateJourneyApiDependencies,
} from "./private-journey-api";

class FixtureVerifier implements SessionVerifier {
  calls: string[] = [];
  async verify(credential: string) {
    this.calls.push(credential);
    return credential === "owner-token" ? { userId: "owner-user" } : undefined;
  }
}

class FixtureJourneyReader implements JourneyDecisionReader {
  calls: Array<{ userId: string; limit: number }> = [];
  rows: JourneyDecisionReadRecord[] = [];
  async listForUser(authenticatedUserId: string, limit: number) {
    this.calls.push({ userId: authenticatedUserId, limit });
    return structuredClone(this.rows);
  }
}

class FixtureJourneyUnitOfWork implements JourneyDecisionUnitOfWork {
  readonly journeys: JourneyDecisionRecord[] = [];
  readonly events: JourneyDecisionDomainEventRecord[] = [];
  runCalls: string[] = [];

  async run<T>(authenticatedUserId: string, work: (transaction: JourneyDecisionTransaction) => Promise<T>): Promise<T> {
    this.runCalls.push(authenticatedUserId);
    const transaction: JourneyDecisionTransaction = {
      findByRequestId: async (requestId, userId) =>
        this.journeys.find((row) => row.requestId === requestId && row.userId === userId),
      getActiveForUpdate: async (userId) =>
        this.journeys.find((row) => row.userId === userId && row.status === "ACTIVE"),
      supersedeActive: async (journeyId, userId, endedAt) => {
        const row = this.journeys.find((value) => value.journeyId === journeyId && value.userId === userId && value.status === "ACTIVE");
        if (!row) throw new Error("missing fixture journey");
        row.status = "SUPERSEDED";
        row.endedAt = endedAt;
      },
      createJourney: async (record) => { this.journeys.push(structuredClone(record)); },
      appendDomainEvent: async (event) => { this.events.push(structuredClone(event)); },
    };
    return work(transaction);
  }
}

function dependencies() {
  const verifier = new FixtureVerifier();
  const reader = new FixtureJourneyReader();
  const unitOfWork = new FixtureJourneyUnitOfWork();
  reader.rows = [{
    journeyId: "journey-current",
    userId: "owner-user",
    name: "Travel Creator",
    activeCapability: "Sound Design",
    status: "ACTIVE",
    decidedAt: "2026-08-17T08:00:00.000Z",
    endedAt: null,
  }];
  const telemetry: TechnicalTelemetryEvent[] = [];
  let requestId = 0;
  let id = 0;
  let operationMs = 100;
  const deps: PrivateJourneyApiDependencies = {
    sessionVerifier: verifier,
    transportClock: { now: () => "2026-08-17T08:00:00.000Z" },
    requestIds: { next: () => `journey-request-${++requestId}` },
    journeyReader: reader,
    journeyUnitOfWork: unitOfWork,
    journeyClock: { now: () => "2026-08-17T08:00:01.000Z" },
    journeyIds: { next(prefix) { id += 1; return `${prefix}-${id}`; } },
    runtime: { environment: "ci", releaseSha: "release-journey-transport", platform: "CI" },
    telemetry: { emit(event) { telemetry.push(structuredClone(event)); } },
    operationTimer: {
      nowMs() { operationMs += 5; return operationMs; },
      nowIso() { return "2026-08-17T08:00:02.000Z"; },
    },
  };
  return { deps, verifier, reader, unitOfWork, telemetry };
}

async function withServer(deps: PrivateJourneyApiDependencies, work: (baseUrl: string) => Promise<void>) {
  const server = createLifeOsPrivateJourneyServer(deps);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function auth() { return { authorization: "Bearer owner-token" }; }
function headers(idempotency = "journey-retry-key-0001") {
  return { ...auth(), "content-type": "application/json", "idempotency-key": idempotency };
}
function command(expectedCurrentJourneyId: string | null = null) {
  return {
    name: "Travel Creator",
    activeCapability: "Sound Design",
    expectedCurrentJourneyId,
    approval: { explicit: true, acknowledgement: "ACTIVATE_JOURNEY" },
  };
}

test("authenticated Journey GET returns DECISION state without owner or request internals", async () => {
  const fixture = dependencies();
  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/journey`, { headers: auth() });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Authorization");
    const body = await response.text();
    assert.equal(body.includes("Travel Creator"), true);
    assert.equal(body.includes("Sound Design"), true);
    assert.equal(body.includes("\"authorityClass\":\"DECISION\""), true);
    assert.equal(body.includes("owner-user"), false);
    assert.equal(body.includes("requestFingerprint"), false);
  });
  assert.deepEqual(fixture.reader.calls, [{ userId: "owner-user", limit: 102 }]);
  assert.equal(fixture.telemetry[0]?.kind, "OPERATION");
  if (fixture.telemetry[0]?.kind !== "OPERATION") throw new Error("Expected operation telemetry");
  assert.equal(fixture.telemetry[0].operation, "GET_JOURNEY_OVERVIEW");
});

test("authentication is resolved before malformed Journey mutation details", async () => {
  const fixture = dependencies();
  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/journey/current`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "do not parse before authentication",
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "authentication_required" });
  });
  assert.equal(fixture.unitOfWork.runCalls.length, 0);
  assert.equal(fixture.telemetry.length, 0);
});

test("Journey POST requires stable JOURNEY_ACTIVATE idempotency", async () => {
  const fixture = dependencies();
  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/journey/current`, {
      method: "POST",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify(command()),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "idempotency_required" });
  });
  assert.equal(fixture.unitOfWork.runCalls.length, 0);
});

test("Journey POST rejects extra transport fields rather than silently accepting them", async () => {
  const fixture = dependencies();
  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/journey/current`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...command(), aiApproved: true }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "invalid_request" });
  });
  assert.equal(fixture.unitOfWork.runCalls.length, 0);
});

test("explicit Journey POST activates once and exact retry replays without a second event", async () => {
  const fixture = dependencies();
  fixture.reader.rows = [];
  await withServer(fixture.deps, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/v1/journey/current`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(command()),
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json() as Record<string, unknown>;
    assert.equal(firstBody.status, "active");
    assert.equal(firstBody.authorityClass, "DECISION");

    const replay = await fetch(`${baseUrl}/api/v1/journey/current`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(command()),
    });
    assert.equal(replay.status, 200);
    const replayBody = await replay.json() as Record<string, unknown>;
    assert.equal(replayBody.status, "replayed");
    assert.equal(replayBody.journeyId, firstBody.journeyId);
  });
  assert.equal(fixture.unitOfWork.journeys.length, 1);
  assert.equal(fixture.unitOfWork.events.length, 1);
  const serialized = JSON.stringify(fixture.telemetry);
  assert.equal(serialized.includes("owner-user"), false);
  assert.equal(serialized.includes("journey-retry-key-0001"), false);
  assert.equal(serialized.includes("web-idem-v1:journey_activate:"), true);
});

test("Journey acknowledgement cannot be weakened by client input", async () => {
  const fixture = dependencies();
  fixture.reader.rows = [];
  const body = command();
  body.approval.explicit = false;
  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/journey/current`, {
      method: "POST",
      headers: headers("journey-no-approval-0001"),
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { status: "explicit_approval_required" });
  });
  assert.equal(fixture.unitOfWork.journeys.length, 0);
  assert.equal(fixture.unitOfWork.events.length, 0);
});
