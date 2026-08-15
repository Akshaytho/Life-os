import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import { OpenAiCaptureInterpreter } from "../../../packages/intelligence/openai-capture-interpreter";
import { captureAndPropose } from "./capture-and-propose";

function providerResponse(output: unknown) {
  return new Response(JSON.stringify({
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("trusted AI interpretation persists only validated observation/suggestion authority", async () => {
  const output = {
    intent: "DATED_PLAN",
    certainty: "CONFIRMED",
    confidence: 0.96,
    observations: [{ label: "Time-bound plan", value: "A Calendar-owned plan is likely intended." }],
    routes: [{
      kind: "CALENDAR_PLAN",
      summary: "Review a possible gym Calendar plan.",
      reason: "The source contains a dated plan but commit readiness remains a separate user-confirmation boundary.",
      calendarTitle: "Gym",
      calendarStartsAt: "2026-08-16T17:00:00+05:30",
      calendarEndsAt: "2026-08-16T18:00:00+05:30",
      calendarCategory: "Health",
      calendarCommitment: "Fixed",
    }],
    clarification: "Confirm the interpreted time and commitment before applying it.",
  };
  const interpreter = new OpenAiCaptureInterpreter({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: (async () => providerResponse(output)) as typeof fetch,
  });
  const unitOfWork = new InMemoryWriteUnitOfWork();
  let id = 0;
  const receipt = await captureAndPropose(
    { rawText: "Gym tomorrow at 5pm." },
    {
      principal: { actorType: "USER", userId: "user-ai-persistence" },
      source: "WEB_APP",
      receivedAt: "2026-08-15T18:00:00.000Z",
      requestId: "request-ai-persistence",
    },
    {
      unitOfWork,
      interpreter,
      clock: { now: () => "2026-08-15T18:00:01.000Z" },
      ids: { next: (prefix) => `${prefix}-ai-persistence-${++id}` },
    },
  );

  const bundle = await unitOfWork.run("user-ai-persistence", (transaction) =>
    transaction.getRoutingBundleForCapture(receipt.captureId, "user-ai-persistence"));

  assert.ok(bundle);
  assert.equal(bundle.interpretation.interpreter, "LIFE_OS_AI");
  assert.equal(bundle.interpretation.observations[0]?.trustClass, "OBSERVATION");
  assert.equal(bundle.proposals.length, 1);
  assert.equal(bundle.proposals[0]?.targetTrustClass, "FACT");
  assert.equal(bundle.proposals[0]?.approvalMode, "EXPLICIT_CONFIRMATION");
  assert.equal(bundle.proposals[0]?.state, "NEEDS_CONFIRMATION");
  assert.equal(bundle.proposals.some((proposal) => proposal.state === "READY_TO_APPLY"), false);
  assert.equal("rawText" in bundle.proposals[0]!.payloadJson, false);
  assert.equal("sourceText" in bundle.proposals[0]!.payloadJson, false);
});
