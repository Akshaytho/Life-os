import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import type { InteractionChangeLedgerReader, PersistedInteractionChangeTrace } from "../../../packages/domain/interaction-change-ledger";
import type { PersistedCaptureProposalReview, ProposalReviewReader } from "../../../packages/domain/proposal-review";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import { createLifeOsPrivateReadServer, type PrivateReadApiDependencies } from "./private-read-api";

class FixtureVerifier implements SessionVerifier {
  calls: string[] = [];
  users = new Map<string, string>([["owner-token", "owner-user"]]);
  error?: Error;

  async verify(credential: string) {
    this.calls.push(credential);
    if (this.error) throw this.error;
    const userId = this.users.get(credential);
    return userId ? { userId } : undefined;
  }
}

class FixtureReviewReader implements ProposalReviewReader {
  calls: Array<{ captureId: string; userId: string }> = [];
  value?: PersistedCaptureProposalReview;
  error?: Error;

  async getCaptureReview(captureId: string, authenticatedUserId: string) {
    this.calls.push({ captureId, userId: authenticatedUserId });
    if (this.error) throw this.error;
    return this.value ? structuredClone(this.value) : undefined;
  }
}

class FixtureLedgerReader implements InteractionChangeLedgerReader {
  calls: Array<{ captureId: string; userId: string }> = [];
  value?: PersistedInteractionChangeTrace;
  error?: Error;

  async getTrace(captureId: string, authenticatedUserId: string) {
    this.calls.push({ captureId, userId: authenticatedUserId });
    if (this.error) throw this.error;
    return this.value ? structuredClone(this.value) : undefined;
  }
}

function reviewFixture(): PersistedCaptureProposalReview {
  return {
    capture: {
      captureId: "capture-1",
      userId: "owner-user",
      rawText: "private owner source",
      source: "WEB_APP",
      correlationId: "capture-1",
      requestId: "stored-request-private",
      receivedAt: "2026-08-13T06:00:00.000Z",
      recordedAt: "2026-08-13T06:00:01.000Z",
    },
    interpretation: {
      interpretationId: "interpretation-1",
      captureId: "capture-1",
      userId: "owner-user",
      version: 1,
      interpreter: "LIFE_OS_AI",
      intent: "DATED_PLAN",
      certainty: "TENTATIVE",
      confidence: 0.8,
      observations: [{ id: "certainty", label: "Certainty", value: "Tentative", trustClass: "OBSERVATION" }],
      clarification: "Should this reserve time?",
      createdAt: "2026-08-13T06:00:02.000Z",
    },
    proposals: [{
      proposalId: "proposal-1",
      interpreterProposalKey: "calendar-1",
      userId: "owner-user",
      captureId: "capture-1",
      interpretationId: "interpretation-1",
      destination: "CALENDAR",
      operation: "CREATE_CALENDAR_PLAN",
      summary: "Prepare Calendar plan",
      targetTrustClass: "FACT",
      approvalMode: "EXPLICIT_CONFIRMATION",
      state: "NEEDS_CONFIRMATION",
      reason: "Tentative wording",
      payloadJson: { title: "Private event", category: "Friends" },
      createdAt: "2026-08-13T06:00:02.000Z",
    }],
  };
}

function ledgerFixture(): PersistedInteractionChangeTrace {
  const review = reviewFixture();
  return {
    capture: review.capture,
    interpretation: review.interpretation,
    proposals: [{ proposal: review.proposals[0] }],
  };
}

function dependencies() {
  const verifier = new FixtureVerifier();
  const reviewReader = new FixtureReviewReader();
  const ledgerReader = new FixtureLedgerReader();
  reviewReader.value = reviewFixture();
  ledgerReader.value = ledgerFixture();
  const telemetry: TechnicalTelemetryEvent[] = [];
  let requestId = 0;
  let operationMs = 100;

  const deps: PrivateReadApiDependencies = {
    sessionVerifier: verifier,
    transportClock: { now: () => "2026-08-13T06:10:00.000Z" },
    requestIds: { next: () => `server-request-${++requestId}` },
    proposalReviewReader: reviewReader,
    interactionLedgerReader: ledgerReader,
    runtime: { environment: "ci", releaseSha: "release-private-read", platform: "CI" },
    telemetry: { emit(event) { telemetry.push(structuredClone(event)); } },
    operationTimer: {
      nowMs() { operationMs += 5; return operationMs; },
      nowIso() { return "2026-08-13T06:10:01.000Z"; },
    },
  };

  return { deps, verifier, reviewReader, ledgerReader, telemetry };
}

async function withServer(
  deps: PrivateReadApiDependencies,
  work: (baseUrl: string) => Promise<void>,
) {
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

function auth(token = "owner-token") {
  return { authorization: `Bearer ${token}` };
}

test("authenticated owner can read proposal review through trusted principal and no-store response", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures/capture-1/review`, { headers: auth() });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Authorization");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");

    const body = await response.json() as { source: { rawText: string }; proposals: Array<{ proposalId: string }> };
    assert.equal(body.source.rawText, "private owner source");
    assert.equal(body.proposals[0].proposalId, "proposal-1");
  });

  assert.deepEqual(fixture.reviewReader.calls, [{ captureId: "capture-1", userId: "owner-user" }]);
  assert.deepEqual(fixture.verifier.calls, ["owner-token"]);
  assert.equal(fixture.telemetry.length, 1);
  const serializedTelemetry = JSON.stringify(fixture.telemetry[0]);
  assert.equal(serializedTelemetry.includes("private owner source"), false);
  assert.equal(serializedTelemetry.includes("owner-token"), false);
  assert.equal(serializedTelemetry.includes("owner-user"), false);
  assert.equal(serializedTelemetry.includes("proposal-1"), false);
  assert.equal(serializedTelemetry.includes("capture-1"), true);
});

test("authenticated owner can read Interaction Change trace without exposing credential to the result", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/interactions/capture-1/trace`, { headers: auth() });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.equal(body.includes("private owner source"), true);
    assert.equal(body.includes("owner-token"), false);
    assert.equal(body.includes("stored-request-private"), false);
  });

  assert.deepEqual(fixture.ledgerReader.calls, [{ captureId: "capture-1", userId: "owner-user" }]);
  assert.equal(fixture.telemetry.length, 1);
  assert.equal(fixture.telemetry[0].kind, "OPERATION");
  if (fixture.telemetry[0].kind !== "OPERATION") throw new Error("Expected operation telemetry");
  assert.equal(fixture.telemetry[0].operation, "GET_INTERACTION_TRACE");
  assert.equal(fixture.telemetry[0].outcome, "SUCCESS");
});

test("client-forged identity headers and query params cannot choose the authenticated owner", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures/capture-1/review?userId=attacker&credential=query-token`, {
      headers: {
        ...auth(),
        "x-life-os-user": "attacker-user",
        "x-user-id": "attacker-user",
      },
    });
    assert.equal(response.status, 200);
  });

  assert.deepEqual(fixture.reviewReader.calls, [{ captureId: "capture-1", userId: "owner-user" }]);
  assert.deepEqual(fixture.verifier.calls, ["owner-token"]);
});

test("missing malformed expired and query-only credentials remain authentication required", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const cases: Array<RequestInit | undefined> = [
      undefined,
      { headers: { authorization: "Basic abc" } },
      { headers: { authorization: "Bearer has whitespace" } },
      { headers: auth("expired-token") },
    ];

    for (const options of cases) {
      const response = await fetch(`${baseUrl}/api/v1/captures/capture-1/review?credential=owner-token`, options);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { status: "authentication_required" });
    }
  });

  assert.equal(fixture.reviewReader.calls.length, 0);
  assert.deepEqual(fixture.verifier.calls, ["expired-token"]);
});

test("authentication provider outage is sanitized and private provider details never reach client", async () => {
  const fixture = dependencies();
  fixture.verifier.error = new Error("provider failed with private-token and secret upstream details");

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures/capture-1/review`, { headers: auth("private-token") });
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.equal(body, JSON.stringify({ status: "authentication_unavailable" }));
    assert.equal(body.includes("private-token"), false);
    assert.equal(body.includes("secret upstream"), false);
  });
});

test("unavailable resource returns the same generic 404 shape and records only technical UNAVAILABLE outcome", async () => {
  const fixture = dependencies();
  fixture.reviewReader.value = undefined;

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures/capture-does-not-exist/review`, { headers: auth() });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { status: "not_found" });
  });

  assert.equal(fixture.telemetry.length, 1);
  assert.equal(fixture.telemetry[0].kind, "OPERATION");
  if (fixture.telemetry[0].kind !== "OPERATION") throw new Error("Expected operation telemetry");
  assert.equal(fixture.telemetry[0].outcome, "UNAVAILABLE");
});

test("reader/provider failure becomes generic internal error and telemetry never receives exception text", async () => {
  const fixture = dependencies();
  fixture.reviewReader.error = new Error("postgresql://private-user:secret-password@private-host/lifeos");

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures/capture-1/review`, { headers: auth() });
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.equal(body, JSON.stringify({ status: "internal_error" }));
    assert.equal(body.includes("secret-password"), false);
    assert.equal(body.includes("private-host"), false);
  });

  const telemetry = JSON.stringify(fixture.telemetry);
  assert.equal(telemetry.includes("secret-password"), false);
  assert.equal(telemetry.includes("private-host"), false);
  assert.equal(telemetry.includes("PROPOSAL_REVIEW_READ_FAILED"), true);
});

test("write-looking and unknown routes remain absent from this transport", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    for (const path of [
      "/api/v1/captures",
      "/api/v1/proposals/proposal-1/apply",
      "/api/v1/proposals/proposal-1/reject",
      "/api/v1/calendar",
      "/debug/env",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: auth() });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: "not_found" });
    }
  });

  assert.equal(fixture.verifier.calls.length, 0);
});

test("known private read routes reject mutation methods before authentication", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/captures/capture-1/review`, { method: "POST" });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET");
    assert.deepEqual(await response.json(), { status: "method_not_allowed" });
  });

  assert.equal(fixture.verifier.calls.length, 0);
  assert.equal(fixture.reviewReader.calls.length, 0);
});

test("invalid path identifier never reaches authentication or data readers", async () => {
  const fixture = dependencies();

  await withServer(fixture.deps, async (baseUrl) => {
    for (const path of [
      "/api/v1/captures/I%20feel%20bad%20today/review",
      "/api/v1/interactions/%2Fetc%2Fpasswd/trace",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { headers: auth() });
      assert.equal(response.status, 404);
    }
  });

  assert.equal(fixture.verifier.calls.length, 0);
  assert.equal(fixture.reviewReader.calls.length, 0);
  assert.equal(fixture.ledgerReader.calls.length, 0);
});
