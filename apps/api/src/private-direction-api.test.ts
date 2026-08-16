import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import type {
  DirectionDecisionDomainEventRecord,
  DirectionDecisionRecord,
  DirectionDecisionTransaction,
  DirectionDecisionUnitOfWork,
} from "../../../packages/domain/direction-decision";
import type {
  DirectionDecisionReader,
  DirectionDecisionReadRecord,
} from "../../../packages/domain/direction-read";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import {
  createLifeOsPrivateDirectionServer,
  type PrivateDirectionApiDependencies,
} from "./private-direction-api";

class FixtureVerifier implements SessionVerifier {
  calls: string[] = [];

  async verify(credential: string) {
    this.calls.push(credential);
    return credential === "owner-token" ? { userId: "owner-user" } : undefined;
  }
}

class FixtureDirectionReader implements DirectionDecisionReader {
  calls: Array<{ userId: string; limit: number }> = [];
  rows: DirectionDecisionReadRecord[] = [];

  async listForUser(authenticatedUserId: string, limit: number) {
    this.calls.push({ userId: authenticatedUserId, limit });
    return structuredClone(this.rows);
  }
}

class FixtureDirectionUnitOfWork implements DirectionDecisionUnitOfWork {
  readonly directions: DirectionDecisionRecord[] = [];
  readonly events: DirectionDecisionDomainEventRecord[] = [];
  runCalls: string[] = [];

  async run<T>(authenticatedUserId: string, work: (transaction: DirectionDecisionTransaction) => Promise<T>): Promise<T> {
    this.runCalls.push(authenticatedUserId);
    const transaction: DirectionDecisionTransaction = {
      findByRequestId: async (requestId, userId) =>
        this.directions.find((row) => row.requestId === requestId && row.userId === userId),
      getActiveForUpdate: async (userId) =>
        this.directions.find((row) => row.userId === userId && row.status === "ACTIVE"),
      supersedeActive: async (directionId, userId, endedAt) => {
        const row = this.directions.find((value) => value.directionId === directionId && value.userId === userId);
        if (!row) throw new Error("missing fixture direction");
        row.status = "SUPERSEDED";
        row.endedAt = endedAt;
      },
      createDirection: async (record) => {
        this.directions.push(structuredClone(record));
      },
      appendDomainEvent: async (event) => {
        this.events.push(structuredClone(event));
      },
    };
    return work(transaction);
  }
}

function dependencies() {
  const verifier = new FixtureVerifier();
  const reader = new FixtureDirectionReader();
  const unitOfWork = new FixtureDirectionUnitOfWork();
  reader.rows = [
    {
      directionId: "direction-current",
      userId: "owner-user",
      statement: "Build a self-reliant creator life without hiding real responsibilities.",
      status: "ACTIVE",
      decidedAt: "2026-08-16T08:00:00.000Z",
      endedAt: null,
    },
    {
      directionId: "direction-old",
      userId: "owner-user",
      statement: "Learn the craft steadily.",
      status: "SUPERSEDED",
      decidedAt: "2026-08-15T08:00:00.000Z",
      endedAt: "2026-08-16T08:00:01.000Z",
    },
  ];

  const telemetry: TechnicalTelemetryEvent[] = [];
  let requestId = 0;
  let id = 0;
  let operationMs = 100;

  const deps: PrivateDirectionApiDependencies = {
    sessionVerifier: verifier,
    transportClock: { now: () => "2026-08-16T08:00:00.000Z" },
    requestIds: { next: () => `direction-request-${++requestId}` },
    directionReader: reader,
    directionUnitOfWork: unitOfWork,
    directionClock: { now: () => "2026-08-16T08:00:01.000Z" },
    directionIds: { next(prefix) { id += 1; return `${prefix}-${id}`; } },
    runtime: { environment: "ci", releaseSha: "release-direction-transport", platform: "CI" },
    telemetry: { emit(event) { telemetry.push(structuredClone(event)); } },
    operationTimer: {
      nowMs() { operationMs += 5; return operationMs; },
      nowIso() { return "2026-08-16T08:00:02.000Z"; },
    },
  };

  return { deps, verifier, reader, unitOfWork, telemetry };
}

async function withServer(deps: PrivateDirectionApiDependencies, work: (baseUrl: string) => Promise<void>) {
  const server = createLifeOsPrivateDirectionServer(deps);
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

function auth() {
  return { authorization: "Bearer owner-token" };
}

function setHeaders(idempotency = "direction-retry-key-0001") {
  return {
    ...auth(),
    "content-type": "application/json",
    "idempotency-key": idempotency,
  };
}

function command(statement = "Make films with curiosity while keeping real responsibilities visible.", expectedCurrentDirectionId: string | null = null) {
  return {
    statement,
    expectedCurrentDirectionId,
    approval: {
      explicit: true,
      acknowledgement: "SET_AS_CURRENT_DIRECTION",
    },
  };
}

test("authenticated Direction GET returns only the user-visible DECISION overview", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/direction`, { headers: auth() });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Authorization");

    const body = await response.text();
    assert.equal(body.includes("Build a self-reliant creator life"), true);
    assert.equal(body.includes("Learn the craft steadily"), true);
    assert.equal(body.includes("\"authorityClass\":\"DECISION\""), true);
    assert.equal(body.includes("owner-user"), false);
    assert.equal(body.includes("requestFingerprint"), false);
    assert.equal(body.includes("requestId"), false);
  });

  assert.deepEqual(fixture.verifier.calls, ["owner-token"]);
  assert.deepEqual(fixture.reader.calls, [{ userId: "owner-user", limit: 102 }]);
  assert.equal(fixture.telemetry.length, 1);
  assert.equal(fixture.telemetry[0]?.kind, "OPERATION");
  if (fixture.telemetry[0]?.kind !== "OPERATION") throw new Error("Expected operation telemetry");
  assert.equal(fixture.telemetry[0].operation, "GET_DIRECTION_OVERVIEW");
  assert.equal(fixture.telemetry[0].outcome, "SUCCESS");
  const serialized = JSON.stringify(fixture.telemetry);
  assert.equal(serialized.includes("Build a self-reliant creator life"), false);
  assert.equal(serialized.includes("owner-user"), false);
});

test("authentication is resolved before malformed Direction mutation details", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "this should not be parsed before auth",
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "authentication_required" });
  });

  assert.equal(fixture.unitOfWork.runCalls.length, 0);
  assert.equal(fixture.telemetry.length, 0);
});

test("Direction POST requires the stable DIRECTION_SET_CURRENT idempotency boundary", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: { ...auth(), "content-type": "application/json" },
      body: JSON.stringify(command()),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "idempotency_required" });
  });

  assert.equal(fixture.unitOfWork.runCalls.length, 0);
  assert.equal(fixture.telemetry.length, 0);
});

test("explicit user Direction POST activates once and exact retry replays without a second event", async () => {
  const fixture = dependencies();
  const statement = "Make films with curiosity while keeping real responsibilities visible.";

  await withServer(fixture.deps, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: setHeaders(),
      body: JSON.stringify(command(statement)),
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json() as Record<string, unknown>;
    assert.equal(firstBody.status, "active");
    assert.equal(firstBody.authorityClass, "DECISION");

    const second = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: setHeaders(),
      body: JSON.stringify(command(statement)),
    });
    assert.equal(second.status, 200);
    const secondBody = await second.json() as Record<string, unknown>;
    assert.equal(secondBody.status, "replayed");
    assert.equal(secondBody.directionId, firstBody.directionId);
  });

  assert.equal(fixture.unitOfWork.directions.length, 1);
  assert.equal(fixture.unitOfWork.events.length, 1);
  assert.equal(fixture.unitOfWork.events[0]?.actorType, "USER");
  assert.equal(fixture.unitOfWork.events[0]?.payloadJson.authorityClass, "DECISION");
  assert.equal(fixture.telemetry.length, 2);
  const serialized = JSON.stringify(fixture.telemetry);
  assert.equal(serialized.includes(statement), false);
  assert.equal(serialized.includes("owner-user"), false);
  assert.equal(serialized.includes("direction-retry-key-0001"), false);
  assert.equal(serialized.includes("web-idem-v1:direction_set_current:"), true);
});

test("high-authority acknowledgement cannot be weakened by transport input", async () => {
  const fixture = dependencies();
  const body = command();
  body.approval.explicit = false;

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: setHeaders(),
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { status: "explicit_approval_required" });
  });

  assert.equal(fixture.unitOfWork.directions.length, 0);
  assert.equal(fixture.unitOfWork.events.length, 0);
});

test("stale expected-current Direction is rejected without mutation", async () => {
  const fixture = dependencies();
  fixture.unitOfWork.directions.push({
    directionId: "direction-newer",
    userId: "owner-user",
    statement: "Newer current Direction",
    status: "ACTIVE",
    decidedAt: "2026-08-16T07:00:00.000Z",
    recordedAt: "2026-08-16T07:00:01.000Z",
    requestId: "existing-direction-request",
    requestFingerprint: "a".repeat(64),
  });

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: setHeaders(),
      body: JSON.stringify(command("Attempt from stale tab", "direction-old")),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { status: "current_direction_changed" });
  });

  assert.equal(fixture.unitOfWork.directions.length, 1);
  assert.equal(fixture.unitOfWork.events.length, 0);
});

test("same retry key with changed authoritative content is an idempotency conflict", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: setHeaders("direction-retry-key-0002"),
      body: JSON.stringify(command("First authoritative Direction")),
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: setHeaders("direction-retry-key-0002"),
      body: JSON.stringify(command("Different authoritative Direction")),
    });
    assert.equal(second.status, 409);
    assert.deepEqual(await second.json(), { status: "idempotency_conflict" });
  });

  assert.equal(fixture.unitOfWork.directions.length, 1);
  assert.equal(fixture.unitOfWork.events.length, 1);
});

test("strict Direction body rejects extra fields instead of accepting ambiguous authority input", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: setHeaders(),
      body: JSON.stringify({ ...command(), aiApproved: true }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "invalid_request" });
  });

  assert.equal(fixture.unitOfWork.runCalls.length, 0);
});

test("missing Direction dependencies fail closed only after successful authentication", async () => {
  const fixture = dependencies();
  const withoutDirection: PrivateDirectionApiDependencies = {
    ...fixture.deps,
    directionReader: undefined,
    directionUnitOfWork: undefined,
    directionClock: undefined,
    directionIds: undefined,
  };

  await withServer(withoutDirection, async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/api/v1/direction`);
    assert.equal(unauthenticated.status, 401);

    const read = await fetch(`${baseUrl}/api/v1/direction`, { headers: auth() });
    assert.equal(read.status, 503);
    assert.deepEqual(await read.json(), { status: "direction_unavailable" });

    const mutation = await fetch(`${baseUrl}/api/v1/direction/current`, {
      method: "POST",
      headers: setHeaders(),
      body: JSON.stringify(command()),
    });
    assert.equal(mutation.status, 503);
    assert.deepEqual(await mutation.json(), { status: "direction_mutation_unavailable" });
  });
});

test("Direction routes expose only reviewed GET/POST methods", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const wrongReadMethod = await fetch(`${baseUrl}/api/v1/direction`, { method: "POST" });
    assert.equal(wrongReadMethod.status, 405);
    assert.equal(wrongReadMethod.headers.get("allow"), "GET");

    const wrongWriteMethod = await fetch(`${baseUrl}/api/v1/direction/current`);
    assert.equal(wrongWriteMethod.status, 405);
    assert.equal(wrongWriteMethod.headers.get("allow"), "POST");

    const unknown = await fetch(`${baseUrl}/api/v1/direction/unknown`, { headers: auth() });
    assert.equal(unknown.status, 404);
  });
});
