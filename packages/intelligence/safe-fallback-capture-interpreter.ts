import type {
  CaptureInterpreter,
  CaptureInterpreterInput,
  CaptureInterpretationResult,
} from "./capture-interpreter";

/**
 * Non-AI fallback used when no trusted semantic interpreter is available.
 *
 * It deliberately makes no claim about the meaning of the user's text. The raw
 * source remains in the Capture record; the structured result only proposes
 * preserving it for later classification.
 */
export class SafeFallbackCaptureInterpreter implements CaptureInterpreter {
  async interpret(_input: CaptureInterpreterInput): Promise<CaptureInterpretationResult> {
    return {
      interpreter: "SAFE_FALLBACK",
      intent: "RAW_THOUGHT",
      certainty: "UNSPECIFIED",
      confidence: 0,
      observations: [{
        id: "safe-fallback",
        label: "Understanding",
        value: "No trusted semantic interpretation was performed",
        trustClass: "OBSERVATION",
      }],
      proposals: [{
        key: "safe-fallback-raw-capture",
        destination: "BRAIN_DUMP",
        operation: "KEEP_RAW_CAPTURE",
        summary: "Keep the original capture intact for later classification.",
        targetTrustClass: "SUGGESTION",
        approvalMode: "REVIEW_AND_APPLY",
        state: "PROPOSED",
        reason: "Life OS had no trusted semantic interpreter, so it preserved the source without inferring meaning.",
        payloadJson: {},
      }],
    };
  }
}
