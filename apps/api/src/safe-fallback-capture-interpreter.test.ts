import assert from "node:assert/strict";
import test from "node:test";
import { SafeFallbackCaptureInterpreter } from "../../../packages/intelligence/safe-fallback-capture-interpreter";

test("safe fallback preserves only a Brain Dump candidate without pretending to interpret meaning", async () => {
  const rawText = "private phrase that must remain only in the capture source";
  const result = await new SafeFallbackCaptureInterpreter().interpret({
    rawText,
    receivedAt: "2026-08-14T10:00:00.000Z",
  });

  assert.equal(result.interpreter, "SAFE_FALLBACK");
  assert.equal(result.intent, "RAW_THOUGHT");
  assert.equal(result.certainty, "UNSPECIFIED");
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.observations, [{
    id: "safe-fallback",
    label: "Understanding",
    value: "No trusted semantic interpretation was performed",
    trustClass: "OBSERVATION",
  }]);
  assert.deepEqual(result.proposals, [{
    key: "safe-fallback-raw-capture",
    destination: "BRAIN_DUMP",
    operation: "KEEP_RAW_CAPTURE",
    summary: "Keep the original capture intact for later classification.",
    targetTrustClass: "SUGGESTION",
    approvalMode: "REVIEW_AND_APPLY",
    state: "PROPOSED",
    reason: "Life OS had no trusted semantic interpreter, so it preserved the source without inferring meaning.",
    payloadJson: {},
  }]);
  assert.equal(JSON.stringify(result).includes(rawText), false);
});

test("fallback semantics do not vary with the content of the user's text", async () => {
  const interpreter = new SafeFallbackCaptureInterpreter();
  const first = await interpreter.interpret({ rawText: "I learned something", receivedAt: "2026-08-14T10:00:00.000Z" });
  const second = await interpreter.interpret({ rawText: "I may travel Saturday", receivedAt: "2026-08-14T10:01:00.000Z" });

  assert.deepEqual(first, second);
});
