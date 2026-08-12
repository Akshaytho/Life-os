import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import type { Clock, RoutingIdGenerator, WriteRequestContext } from "../../../packages/domain/write-boundary";
import type {
  CaptureInterpretationResult,
  CaptureInterpreter,
  CaptureInterpreterInput,
} from "../../../packages/intelligence/capture-interpreter";
import { captureAndPropose, CaptureProposalPersistenceError } from "./capture-and-propose";

class FixedClock implements Clock {
  now() { return "2026-08-12T19:40:00.000Z"; }
}

class SequenceRoutingIds implements RoutingIdGenerator {
  private counts = { capture: 0, interpretation: 0, proposal: 0 };

  next(prefix: "capture" | "interpretation" | "proposal") {
    this.counts[prefix] += 1;
    return `${prefix}-${this.counts[prefix]}`;
  }
}

function interpretation(): CaptureInterpretationResult {
  return {
    interpreter: "LIFE_OS_AI",
    intent: "DATED_PLAN",
    certainty: "CONFIRMED",
    confidence: 0.93,
    observations: [
      { id: "intent", label: "Intent", value: "Confirmed health plan", trustClass: "OBSERVATION" },
    ],
    proposals: [
      {
        key: "calendar-plan",
        destination: "CALENDAR",
        operation: "CREATE_CALENDAR_PLAN",
        summary: "Create the reviewed gym plan.",
        targetTrustClass: "FACT",
        approvalMode: "REVIEW_AND_APPLY",
        state: "READY_TO_APPLY",
        reason: "Calendar owns time-bound plans.",
        payloadJson: {
          title: "Gym",
          startsAt: "2026-08-13T13:30:00.000Z",
          endsAt: "2026-08-13T14:30:00.000Z",
          category: "Health",
          commitment: "Important",
        },
      },
      {
        key: "decision-history",
        destination: "MEMORY",
        operation: "RECORD_DECISION",
        summary: "Preserve that the dated plan was explicitly decided.",
        targetTrustClass: "DECISION",
        approvalMode: "REVIEW_AND_APPLY",
        state: "READY_TO_APPLY",
        reason: "Decision history is separate from the Calendar projection.",
        payloadJson: { decisionKind: "dated-plan" },
      },
    ],
  };
}

class FixtureInterpreter implements CaptureInterpreter {
  calls: CaptureInterpreterInput[] = [];
  failuresRemaining = 0;

  constructor(public result: CaptureInterpretationResult = interpretation()) {}

  async interpret(input: CaptureInterpreterInput): Promise<CaptureInterpretationResult> {
    this.calls.push({ ...input });
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("interpreter unavailable");
    }
    return structuredClone(this.result);
  }
}

function context(overrides: Partial<WriteRequestContext> = {}): WriteRequestContext {
  const base: WriteRequestContext = {
    principal: { actorType: "USER", userId: "user-1" },
    source: "WEB_APP",
    receivedAt: "2026-08-12T19:39:58.000Z",
    requestId: "capture-request-1",
  };
  return { ...base, ...overrides, principal: { ...base.principal, ...(overrides.principal ?? {}) } };
}

function dependencies(unitOfWork = new InMemoryWriteUnitOfWork(), interpreter = new FixtureInterpreter()) {
  return {
    unitOfWork,
    interpreter,
    clock: new FixedClock(),
    ids: new SequenceRoutingIds(),
  };
}

test("persists raw Capture first and stores interpretation plus proposals without canonical life writes", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const interpreter = new FixtureInterpreter();
  const receipt = await captureAndPropose(
    { rawText: "Gym tomorrow at 7 PM.  Keep  two spaces." },
    context(),
    dependencies(unitOfWork, interpreter),
  );
  const state = unitOfWork.snapshot();

  assert.equal(receipt.idempotentReplay, false);
  assert.equal(state.captures.length, 1);
  assert.equal(state.captures[0].rawText, "Gym tomorrow at 7 PM.  Keep  two spaces.");
  assert.equal(state.captures[0].receivedAt, "2026-08-12T19:39:58.000Z");
  assert.equal(state.captures[0].requestId, "capture-request-1");
  assert.equal(state.interpretations.length, 1);
  assert.equal(state.routingProposals.length, 2);
  assert.equal(state.routingProposals[0].interpreterProposalKey, "calendar-plan");
  assert.equal(state.routingProposals[0].proposalId, "proposal-1");
  assert.equal(state.routingProposals[1].proposalId, "proposal-2");
  assert.equal(state.calendarPlans.length, 0);
  assert.equal(state.domainEvents.length, 0);
  assert.equal(state.appliedProposals.length, 0);
  assert.equal("sourceText" in state.routingProposals[0].payloadJson, false);
});

test("client cannot redefine destination or structured proposal fields during Capture", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const forgedCommand = {
    rawText: "Gym tomorrow at 7 PM.",
    destination: "YOU",
    operation: "PROPOSE_DIRECTION_RECONSIDERATION",
    payloadJson: { title: "Forged trip" },
    state: "APPLIED",
  } as unknown as { rawText: string };

  await captureAndPropose(forgedCommand, context(), dependencies(unitOfWork));
  const proposal = unitOfWork.snapshot().routingProposals[0];
  assert.equal(proposal.destination, "CALENDAR");
  assert.equal(proposal.operation, "CREATE_CALENDAR_PLAN");
  assert.equal(proposal.state, "READY_TO_APPLY");
  assert.equal(proposal.payloadJson.title, "Gym");
});

test("interpreter failure leaves the original Capture durable and no partial interpretation", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const interpreter = new FixtureInterpreter();
  interpreter.failuresRemaining = 1;

  await assert.rejects(
    () => captureAndPropose({ rawText: "I might travel next month." }, context(), dependencies(unitOfWork, interpreter)),
    /interpreter unavailable/,
  );

  const state = unitOfWork.snapshot();
  assert.equal(state.captures.length, 1);
  assert.equal(state.interpretations.length, 0);
  assert.equal(state.routingProposals.length, 0);
});

test("retry after interpreter failure reuses the first trusted receipt time", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const interpreter = new FixtureInterpreter();
  interpreter.failuresRemaining = 1;
  const deps = dependencies(unitOfWork, interpreter);

  await assert.rejects(
    () => captureAndPropose({ rawText: "Tomorrow at 7 PM." }, context(), deps),
    /interpreter unavailable/,
  );

  const receipt = await captureAndPropose(
    { rawText: "Tomorrow at 7 PM." },
    context({ receivedAt: "2026-08-13T20:00:00.000Z" }),
    deps,
  );

  assert.equal(receipt.captureId, "capture-1");
  assert.equal(interpreter.calls.length, 2);
  assert.equal(interpreter.calls[1].receivedAt, "2026-08-12T19:39:58.000Z");
});

test("successful request replay returns the existing bundle without invoking the interpreter again", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const interpreter = new FixtureInterpreter();
  const deps = dependencies(unitOfWork, interpreter);

  const first = await captureAndPropose({ rawText: "Gym tomorrow at 7 PM." }, context(), deps);
  const second = await captureAndPropose(
    { rawText: "Gym tomorrow at 7 PM." },
    context({ receivedAt: "2026-08-12T19:41:00.000Z" }),
    deps,
  );

  assert.equal(second.idempotentReplay, true);
  assert.equal(second.captureId, first.captureId);
  assert.equal(second.interpretationId, first.interpretationId);
  assert.deepEqual(second.proposalIds, first.proposalIds);
  assert.equal(interpreter.calls.length, 1);
});

test("same request ID with different raw text is rejected instead of mutating the original Capture", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const interpreter = new FixtureInterpreter();
  const deps = dependencies(unitOfWork, interpreter);

  await captureAndPropose({ rawText: "Original words" }, context(), deps);
  await assert.rejects(
    () => captureAndPropose({ rawText: "Different words" }, context(), deps),
    (error: unknown) => error instanceof CaptureProposalPersistenceError && /different Capture content/.test(error.message),
  );

  const state = unitOfWork.snapshot();
  assert.equal(state.captures.length, 1);
  assert.equal(state.captures[0].rawText, "Original words");
  assert.equal(interpreter.calls.length, 1);
});

test("proposal persistence failure rolls back the entire interpretation bundle but keeps Capture", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  unitOfWork.failNextAt("CREATE_ROUTING_PROPOSAL");

  await assert.rejects(
    () => captureAndPropose({ rawText: "Gym tomorrow at 7 PM." }, context(), dependencies(unitOfWork)),
    /Injected transaction failure at CREATE_ROUTING_PROPOSAL/,
  );

  const state = unitOfWork.snapshot();
  assert.equal(state.captures.length, 1);
  assert.equal(state.interpretations.length, 0);
  assert.equal(state.routingProposals.length, 0);
});

test("invalid high-authority ready state is rejected while Capture remains durable", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const invalid = interpretation();
  invalid.proposals = [{
    key: "direction",
    destination: "YOU",
    operation: "PROPOSE_DIRECTION_RECONSIDERATION",
    summary: "Replace direction.",
    targetTrustClass: "DECISION",
    approvalMode: "HIGH_AUTHORITY_APPROVAL",
    state: "READY_TO_APPLY",
    reason: "Interpreter guessed a direction change.",
    payloadJson: {},
  }];

  await assert.rejects(
    () => captureAndPropose({ rawText: "I want to become a filmmaker now." }, context(), dependencies(unitOfWork, new FixtureInterpreter(invalid))),
    (error: unknown) => error instanceof CaptureProposalPersistenceError && /High-authority/.test(error.message),
  );

  const state = unitOfWork.snapshot();
  assert.equal(state.captures.length, 1);
  assert.equal(state.interpretations.length, 0);
  assert.equal(state.routingProposals.length, 0);
});

test("ready Calendar proposal must contain complete applyable semantics", async () => {
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const invalid = interpretation();
  invalid.proposals[0].payloadJson = { title: "Gym", category: "Health" };

  await assert.rejects(
    () => captureAndPropose({ rawText: "Gym sometime tomorrow." }, context(), dependencies(unitOfWork, new FixtureInterpreter(invalid))),
    (error: unknown) => error instanceof CaptureProposalPersistenceError && /explicit start and end/.test(error.message),
  );

  assert.equal(unitOfWork.snapshot().captures.length, 1);
  assert.equal(unitOfWork.snapshot().routingProposals.length, 0);
});
