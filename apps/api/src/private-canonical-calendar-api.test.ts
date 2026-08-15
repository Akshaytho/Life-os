import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import type { CanonicalCalendarReader, CanonicalCalendarRecord } from "../../../packages/domain/canonical-calendar-read";
import type { InteractionChangeLedgerReader } from "../../../packages/domain/interaction-change-ledger";
import type { ProposalReviewReader } from "../../../packages/domain/proposal-review";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import { createLifeOsPrivateReadServer, type PrivateReadApiDependencies } from "./private-read-api";

class FixtureVerifier implements SessionVerifier {
  calls: string[] = [];

  async verify(credential: string) {
    this.calls.push(credential);
    return credential === "owner-token" ? { userId: "owner-user" } : undefined;
  }
}

class FixtureCalendarReader implements CanonicalCalendarReader {
  calls: Array<{ userId: string; from: string; to: string }> = [];
  records: CanonicalCalendarRecord[] = [];

  async listOverlapping(authenticatedUserId: string, fromInclusive: string, toExclusive: string) {
    this.calls.push({ userId: authenticatedUserId, from: fromInclusive, to: toExclusive });
    return structuredClone(this.records);
  }
}

const emptyReviewReader: ProposalReviewReader = {
  async getCaptureReview() { return undefined; },
};
const emptyLedgerReader: InteractionChangeLedgerReader = {
  async getTrace() { return undefined; },
};

function dependencies(withCalendarReader = true) {
  const verifier = new FixtureVerifier();
  const calendarReader = new FixtureCalendarReader();
  calendarReader.records = [{
    id: "calendar-1",
    userId: "owner-user",
    title: "Gym",
    startsAt: "2026-08-16T11:30:00.000Z",
    endsAt: "2026-08-16T12:30:00.000Z",
    category: "Health",
    commitment: "Important",
    createdAt: "2026-08-15T18:32:01.000Z",
    sourceProposalId: "proposal-private-1",
  }];
  const telemetry: TechnicalTelemetryEvent[] = [];
  let requestId = 0;
  let operationMs = 100;

  const deps: PrivateReadApiDependencies = {
    sessionVerifier: verifier,
    transportClock: { now: () => "2026-08-16T00:10:00.000Z" },
    requestIds: { next: () => `calendar-request-${++requestId}` },
    proposalReviewReader: emptyReviewReader,
    interactionLedgerReader: emptyLedgerReader,
    canonicalCalendarReader: withCalendarReader ? calendarReader : undefined,
    runtime: { environment: "ci", releaseSha: "release-calendar-read", platform: "CI" },
    telemetry: { emit(event) { telemetry.push(structuredClone(event)); } },
    operationTimer: {
      nowMs() { operationMs += 5; return operationMs; },
      nowIso() { return "2026-08-16T00:10:01.000Z"; },
    },
  };

  return { deps, verifier, calendarReader, telemetry };
}

async function withServer(deps: PrivateReadApiDependencies, work: (baseUrl: string) => Promise<void>) {
  const server = createLifeOsPrivateReadServer(deps);
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

test("authenticated Calendar GET returns canonical facts only and binds reader ownership to verified session", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const query = new URLSearchParams({
      from: "2026-08-16T00:00:00+05:30",
      to: "2026-08-17T00:00:00+05:30",
    });
    const response = await fetch(`${baseUrl}/api/v1/calendar?${query.toString()}`, { headers: auth() });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Authorization");

    const body = await response.text();
    assert.equal(body.includes("Gym"), true);
    assert.equal(body.includes("\"authorityClass\":\"FACT\""), true);
    assert.equal(body.includes("owner-user"), false);
    assert.equal(body.includes("proposal-private-1"), false);
  });

  assert.deepEqual(fixture.verifier.calls, ["owner-token"]);
  assert.deepEqual(fixture.calendarReader.calls, [{
    userId: "owner-user",
    from: "2026-08-15T18:30:00.000Z",
    to: "2026-08-16T18:30:00.000Z",
  }]);
  assert.equal(fixture.telemetry.length, 1);
  assert.equal(fixture.telemetry[0]?.kind, "OPERATION");
  if (fixture.telemetry[0]?.kind !== "OPERATION") throw new Error("Expected operation telemetry");
  assert.equal(fixture.telemetry[0].operation, "GET_CANONICAL_CALENDAR");
  assert.equal(fixture.telemetry[0].outcome, "SUCCESS");
  const serializedTelemetry = JSON.stringify(fixture.telemetry);
  assert.equal(serializedTelemetry.includes("Gym"), false);
  assert.equal(serializedTelemetry.includes("owner-user"), false);
});

test("authentication is resolved before malformed Calendar query details", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/calendar?from=not-a-time`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "authentication_required" });
  });

  assert.equal(fixture.calendarReader.calls.length, 0);
  assert.equal(fixture.telemetry.length, 0);
});

test("authenticated invalid Calendar window is a sanitized rejected read and never reaches persistence", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/calendar?from=${encodeURIComponent("2026-08-17T00:00:00Z")}&to=${encodeURIComponent("2026-08-16T00:00:00Z")}`,
      { headers: auth() },
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "invalid_calendar_window" });
  });

  assert.equal(fixture.calendarReader.calls.length, 0);
  assert.equal(fixture.telemetry.length, 1);
  assert.equal(fixture.telemetry[0]?.kind, "OPERATION");
  if (fixture.telemetry[0]?.kind !== "OPERATION") throw new Error("Expected operation telemetry");
  assert.equal(fixture.telemetry[0].outcome, "REJECTED");
});

test("missing Calendar reader fails closed only after authentication", async () => {
  const fixture = dependencies(false);

  await withServer(fixture.deps, async (baseUrl) => {
    const query = new URLSearchParams({ from: "2026-08-16T00:00:00Z", to: "2026-08-17T00:00:00Z" });
    const response = await fetch(`${baseUrl}/api/v1/calendar?${query.toString()}`, { headers: auth() });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "calendar_unavailable" });
  });

  assert.deepEqual(fixture.verifier.calls, ["owner-token"]);
});
