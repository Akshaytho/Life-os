import assert from "node:assert/strict";
import test from "node:test";
import { captureAndPropose, CaptureProposalPersistenceError } from "./capture-and-propose";
import { withWebWriteIdempotency, WebWriteIdempotencyError } from "./web-write-idempotency";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import type { CaptureInterpreter } from "../../../packages/intelligence/capture-interpreter";

function context(userId: string, requestId: string, receivedAt: string): WriteRequestContext {
  return {
    principal: { actorType: "USER", userId },
    source: "WEB_APP",
    receivedAt,
    requestId,
  };
}

function ids() {
  let value = 0;
  return { next(prefix: string) { value += 1; return `${prefix}-idem-${value}`; } };
}

const interpreter: CaptureInterpreter = {
  async interpret() {
    return {
      interpreter: "LIFE_OS_AI",
      intent: "RAW_THOUGHT",
      certainty: "UNSPECIFIED",
      confidence: 0.72,
      observations: [{ id: "raw", label: "Type", value: "Raw thought", trustClass: "OBSERVATION" }],
      proposals: [{
        key: "keep-raw",
        destination: "BRAIN_DUMP",
        operation: "KEEP_RAW_CAPTURE",
        summary: "Keep this thought available",
        targetTrustClass: "REFLECTION",
        approvalMode: "REVIEW_AND_APPLY",
        state: "PROPOSED",
        reason: "Synthetic idempotency fixture",
        payloadJson: {},
      }],
    };
  },
};

test("same user + same retry key derives the same opaque request ID regardless of transport request ID", () => {
  const first = withWebWriteIdempotency(
    context("user-1", "server-request-a", "2026-08-13T07:00:00.000Z"),
    "CAPTURE_CREATE",
    "capture-retry-key-0001",
  );
  const second = withWebWriteIdempotency(
    context("user-1", "server-request-b", "2026-08-13T07:01:00.000Z"),
    "CAPTURE_CREATE",
    "capture-retry-key-0001",
  );

  assert.equal(first.requestId, second.requestId);
  assert.equal(first.requestId.startsWith("web-idem-v1:capture_create:"), true);
  assert.equal(first.requestId.includes("capture-retry-key-0001"), false);
  assert.equal(first.requestId.includes("user-1"), false);
  assert.equal(first.receivedAt, "2026-08-13T07:00:00.000Z");
  assert.equal(second.receivedAt, "2026-08-13T07:01:00.000Z");
});

test("same retry key is isolated by authenticated user", () => {
  const a = withWebWriteIdempotency(context("user-a", "request-a", "2026-08-13T07:00:00.000Z"), "CAPTURE_CREATE", "capture-retry-key-shared");
  const b = withWebWriteIdempotency(context("user-b", "request-b", "2026-08-13T07:00:00.000Z"), "CAPTURE_CREATE", "capture-retry-key-shared");
  assert.notEqual(a.requestId, b.requestId);
});

test("weak/prose retry keys are rejected before application persistence", () => {
  for (const value of [undefined, "", "short", "this contains spaces", "x".repeat(129)]) {
    assert.throws(
      () => withWebWriteIdempotency(context("user-1", "request", "2026-08-13T07:00:00.000Z"), "CAPTURE_CREATE", value),
      (error: unknown) => error instanceof WebWriteIdempotencyError,
    );
  }
});

test("network-style retry returns the original Capture/proposal bundle instead of creating a duplicate", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const idGenerator = ids();
  let clockTick = 0;
  let interpretationCalls = 0;
  const countedInterpreter: CaptureInterpreter = {
    async interpret(input) {
      interpretationCalls += 1;
      return interpreter.interpret(input);
    },
  };
  const clock = { now: () => new Date(Date.parse("2026-08-13T07:00:00.000Z") + ++clockTick * 1000).toISOString() };

  const firstContext = withWebWriteIdempotency(
    context("user-1", "server-request-a", "2026-08-13T07:00:00.000Z"),
    "CAPTURE_CREATE",
    "capture-retry-key-0001",
  );
  const first = await captureAndPropose(
    { rawText: "Synthetic retry-safe thought" },
    firstContext,
    { unitOfWork, interpreter: countedInterpreter, clock, ids: idGenerator },
  );

  const retryContext = withWebWriteIdempotency(
    context("user-1", "server-request-b", "2026-08-13T07:05:00.000Z"),
    "CAPTURE_CREATE",
    "capture-retry-key-0001",
  );
  const replay = await captureAndPropose(
    { rawText: "Synthetic retry-safe thought" },
    retryContext,
    { unitOfWork, interpreter: countedInterpreter, clock, ids: idGenerator },
  );

  assert.equal(first.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.captureId, first.captureId);
  assert.deepEqual(replay.proposalIds, first.proposalIds);
  assert.equal(interpretationCalls, 1);
  assert.equal(unitOfWork.snapshot().captures.length, 1);
  assert.equal(unitOfWork.snapshot().routingProposals.length, 1);
});

test("same retry key cannot be rebound to different Capture content", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const idGenerator = ids();
  let clockTick = 0;
  const clock = { now: () => new Date(Date.parse("2026-08-13T07:00:00.000Z") + ++clockTick * 1000).toISOString() };
  const firstContext = withWebWriteIdempotency(context("user-1", "a", "2026-08-13T07:00:00.000Z"), "CAPTURE_CREATE", "capture-retry-key-0001");
  await captureAndPropose({ rawText: "Original content" }, firstContext, { unitOfWork, interpreter, clock, ids: idGenerator });

  const retryContext = withWebWriteIdempotency(context("user-1", "b", "2026-08-13T07:02:00.000Z"), "CAPTURE_CREATE", "capture-retry-key-0001");
  await assert.rejects(
    () => captureAndPropose({ rawText: "Different content" }, retryContext, { unitOfWork, interpreter, clock, ids: idGenerator }),
    (error: unknown) => error instanceof CaptureProposalPersistenceError && /different Capture content/.test(error.message),
  );

  assert.equal(unitOfWork.snapshot().captures.length, 1);
});
