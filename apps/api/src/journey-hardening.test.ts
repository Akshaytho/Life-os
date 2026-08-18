import assert from "node:assert/strict";
import test from "node:test";
import type {
  JourneyDecisionTransaction,
  JourneyDecisionUnitOfWork,
} from "../../../packages/domain/journey-decision";
import type { WriteRequestContext } from "../../../packages/domain/write-boundary";
import { activateJourneyDecision, JourneyDecisionError } from "./activate-journey-decision";
import { withWebWriteIdempotency } from "./web-write-idempotency";

class EmptyUnitOfWork implements JourneyDecisionUnitOfWork {
  runs = 0;
  async run<T>(_authenticatedUserId: string, work: (transaction: JourneyDecisionTransaction) => Promise<T>): Promise<T> {
    this.runs += 1;
    return work({
      findByRequestId: async () => undefined,
      getActiveForUpdate: async () => undefined,
      supersedeActive: async () => { throw new Error("unexpected supersession"); },
      createJourney: async () => { throw new Error("invalid input reached persistence"); },
      appendDomainEvent: async () => { throw new Error("invalid input reached event persistence"); },
    });
  }
}

function context(index: number): WriteRequestContext {
  const base: WriteRequestContext = {
    principal: { actorType: "USER", userId: "user-a" },
    source: "WEB_APP",
    receivedAt: "2026-08-17T12:00:00.000Z",
    requestId: "transport-request",
  };
  return withWebWriteIdempotency(base, "JOURNEY_ACTIVATE", `journey-hardening-key-${String(index).padStart(4, "0")}`);
}

function deps(unitOfWork: JourneyDecisionUnitOfWork) {
  return {
    unitOfWork,
    clock: { now: () => "2026-08-17T12:00:01.000Z" },
    ids: { next: (prefix: "journey" | "event") => `${prefix}-1` },
  };
}

test("rejects 120 oversized Journey/capability decision inputs before persistence", async () => {
  for (let index = 0; index < 120; index += 1) {
    const unitOfWork = new EmptyUnitOfWork();
    const invalidName = index % 2 === 0 ? `J${"x".repeat(240 + index + 1)}` : "Travel Creator";
    const invalidCapability = index % 2 === 1 ? `C${"y".repeat(240 + index + 1)}` : "Sound Design";

    await assert.rejects(
      () => activateJourneyDecision(
        {
          name: invalidName,
          activeCapability: invalidCapability,
          expectedCurrentJourneyId: null,
          approval: { explicit: true, acknowledgement: "ACTIVATE_JOURNEY" },
        },
        context(index),
        deps(unitOfWork),
      ),
      (error: unknown) =>
        error instanceof JourneyDecisionError &&
        error.code === (index % 2 === 0 ? "INVALID_NAME" : "INVALID_ACTIVE_CAPABILITY"),
      `case ${index} should fail closed`,
    );
    assert.equal(unitOfWork.runs, 0, `case ${index} must not enter the transaction`);
  }
});

test("rejects blank Journey fields and malformed expected-current identifiers", async () => {
  const cases = [
    { name: "", activeCapability: "Sound Design", expectedCurrentJourneyId: null, expectedCode: "INVALID_NAME" },
    { name: "   ", activeCapability: "Sound Design", expectedCurrentJourneyId: null, expectedCode: "INVALID_NAME" },
    { name: "Travel Creator", activeCapability: "", expectedCurrentJourneyId: null, expectedCode: "INVALID_ACTIVE_CAPABILITY" },
    { name: "Travel Creator", activeCapability: "   ", expectedCurrentJourneyId: null, expectedCode: "INVALID_ACTIVE_CAPABILITY" },
    { name: "Travel Creator", activeCapability: "Sound Design", expectedCurrentJourneyId: " invalid id ", expectedCode: "INVALID_JOURNEY" },
    { name: "Travel Creator", activeCapability: "Sound Design", expectedCurrentJourneyId: "!invalid", expectedCode: "INVALID_JOURNEY" },
  ];

  for (const [index, value] of cases.entries()) {
    const unitOfWork = new EmptyUnitOfWork();
    await assert.rejects(
      () => activateJourneyDecision(
        {
          name: value.name,
          activeCapability: value.activeCapability,
          expectedCurrentJourneyId: value.expectedCurrentJourneyId,
          approval: { explicit: true, acknowledgement: "ACTIVATE_JOURNEY" },
        },
        context(200 + index),
        deps(unitOfWork),
      ),
      (error: unknown) => error instanceof JourneyDecisionError && error.code === value.expectedCode,
    );
    assert.equal(unitOfWork.runs, 0);
  }
});

test("rejects invalid clocks and invalid generated identifiers without creating canonical state", async () => {
  const clockUnitOfWork = new EmptyUnitOfWork();
  const badContext = { ...context(300), receivedAt: "not-a-date" };
  await assert.rejects(
    () => activateJourneyDecision(
      {
        name: "Travel Creator",
        activeCapability: "Sound Design",
        expectedCurrentJourneyId: null,
        approval: { explicit: true, acknowledgement: "ACTIVATE_JOURNEY" },
      },
      badContext,
      deps(clockUnitOfWork),
    ),
    (error: unknown) => error instanceof JourneyDecisionError && error.code === "INVALID_JOURNEY",
  );
  assert.equal(clockUnitOfWork.runs, 0);
});
