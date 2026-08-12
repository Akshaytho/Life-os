import assert from "node:assert/strict";
import test from "node:test";
import type {
  SessionVerifier,
  TransportClock,
  TransportRequestIdGenerator,
  VerifiedUserSession,
} from "../../../packages/domain/trusted-transport-auth";
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  createTrustedWebRequestContext,
  TrustedTransportConfigurationError,
} from "./create-trusted-web-request-context";

class FixtureVerifier implements SessionVerifier {
  calls: string[] = [];
  result: VerifiedUserSession | undefined = { userId: "trusted-user" };
  error?: Error;

  async verify(credential: string) {
    this.calls.push(credential);
    if (this.error) throw this.error;
    return this.result ? { ...this.result } : undefined;
  }
}

class SequenceClock implements TransportClock {
  private index = 0;
  constructor(private readonly values = ["2026-08-13T00:00:00.000Z", "2026-08-13T00:00:01.000Z"]) {}
  now() {
    const value = this.values[Math.min(this.index, this.values.length - 1)];
    this.index += 1;
    return value;
  }
}

class SequenceRequestIds implements TransportRequestIdGenerator {
  private index = 0;
  next() {
    this.index += 1;
    return `server-request-${this.index}`;
  }
}

function dependencies(verifier = new FixtureVerifier()) {
  return {
    sessionVerifier: verifier,
    clock: new SequenceClock(),
    requestIds: new SequenceRequestIds(),
  };
}

test("creates trusted context only from verified session plus server-owned metadata", async () => {
  const verifier = new FixtureVerifier();
  const context = await createTrustedWebRequestContext(
    { credential: "opaque-session-secret" },
    dependencies(verifier),
  );

  assert.deepEqual(context, {
    principal: { actorType: "USER", userId: "trusted-user" },
    source: "WEB_APP",
    receivedAt: "2026-08-13T00:00:00.000Z",
    requestId: "server-request-1",
  });
  assert.deepEqual(verifier.calls, ["opaque-session-secret"]);
  assert.equal(JSON.stringify(context).includes("opaque-session-secret"), false);
});

test("ignores forged client identity, source, request time and request ID fields", async () => {
  const forged = {
    credential: "opaque-session-secret",
    principal: { actorType: "USER", userId: "forged-user" },
    userId: "forged-user",
    source: "AI_CHAT",
    receivedAt: "1999-01-01T00:00:00.000Z",
    requestId: "client-request-id",
  } as unknown as { credential: string };

  const context = await createTrustedWebRequestContext(forged, dependencies());
  assert.equal(context.principal.userId, "trusted-user");
  assert.equal(context.source, "WEB_APP");
  assert.equal(context.receivedAt, "2026-08-13T00:00:00.000Z");
  assert.equal(context.requestId, "server-request-1");
});

test("captures receivedAt before session verification completes", async () => {
  let clockReads = 0;
  let clockReadAtVerify = -1;
  const verifier: SessionVerifier = {
    async verify() {
      clockReadAtVerify = clockReads;
      return { userId: "trusted-user" };
    },
  };
  const clock: TransportClock = {
    now() {
      clockReads += 1;
      return "2026-08-13T00:00:00.000Z";
    },
  };

  await createTrustedWebRequestContext(
    { credential: "opaque-session-secret" },
    { sessionVerifier: verifier, clock, requestIds: new SequenceRequestIds() },
  );

  assert.equal(clockReadAtVerify, 1);
});

test("rejects missing or blank credentials without echoing secret material", async () => {
  const verifier = new FixtureVerifier();

  for (const credential of [undefined, "", "   "]) {
    await assert.rejects(
      () => createTrustedWebRequestContext({ credential }, dependencies(verifier)),
      (error: unknown) => error instanceof AuthenticationRequiredError && error.message === "Authentication required",
    );
  }
  assert.deepEqual(verifier.calls, []);
});

test("invalid or expired session returns generic authentication-required failure", async () => {
  const verifier = new FixtureVerifier();
  verifier.result = undefined;
  const secret = "expired-super-secret-session";

  await assert.rejects(
    () => createTrustedWebRequestContext({ credential: secret }, dependencies(verifier)),
    (error: unknown) =>
      error instanceof AuthenticationRequiredError &&
      error.message === "Authentication required" &&
      !error.message.includes(secret),
  );
});

test("verifier/provider failure is distinct from invalid authentication and hides provider details", async () => {
  const verifier = new FixtureVerifier();
  const secret = "private-session-value";
  verifier.error = new Error(`provider failed while checking ${secret}`);

  await assert.rejects(
    () => createTrustedWebRequestContext({ credential: secret }, dependencies(verifier)),
    (error: unknown) =>
      error instanceof AuthenticationUnavailableError &&
      error.message === "Authentication service unavailable" &&
      !error.message.includes(secret) &&
      !error.message.includes("provider failed"),
  );
});

test("empty user identity returned by verifier is not accepted as an authenticated principal", async () => {
  const verifier = new FixtureVerifier();
  verifier.result = { userId: "   " };

  await assert.rejects(
    () => createTrustedWebRequestContext({ credential: "opaque-session-secret" }, dependencies(verifier)),
    (error: unknown) => error instanceof AuthenticationRequiredError,
  );
});

test("server metadata configuration failures do not fall back to client values", async () => {
  const verifier = new FixtureVerifier();
  const forged = {
    credential: "opaque-session-secret",
    requestId: "client-fallback-id",
    receivedAt: "2026-08-13T00:00:00.000Z",
  } as unknown as { credential: string };

  await assert.rejects(
    () => createTrustedWebRequestContext(
      forged,
      {
        sessionVerifier: verifier,
        clock: new SequenceClock(),
        requestIds: { next: () => "" },
      },
    ),
    (error: unknown) => error instanceof TrustedTransportConfigurationError && /requestId/.test(error.message),
  );

  await assert.rejects(
    () => createTrustedWebRequestContext(
      forged,
      {
        sessionVerifier: verifier,
        clock: { now: () => "not-a-time" },
        requestIds: new SequenceRequestIds(),
      },
    ),
    (error: unknown) => error instanceof TrustedTransportConfigurationError && /receivedAt/.test(error.message),
  );
});

test("each accepted request receives a fresh server request ID", async () => {
  const verifier = new FixtureVerifier();
  const deps = {
    sessionVerifier: verifier,
    clock: new SequenceClock(),
    requestIds: new SequenceRequestIds(),
  };

  const first = await createTrustedWebRequestContext({ credential: "session-1" }, deps);
  const second = await createTrustedWebRequestContext({ credential: "session-1" }, deps);

  assert.equal(first.requestId, "server-request-1");
  assert.equal(second.requestId, "server-request-2");
  assert.notEqual(first.requestId, second.requestId);
});
