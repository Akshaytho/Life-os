import type {
  CaptureInterpreter,
  CaptureInterpreterInput,
  CaptureInterpretationResult,
} from "./capture-interpreter";

/**
 * Keeps provider/model failure outside the user's write boundary. Raw Capture is
 * already durably stored before interpretation runs; if the primary interpreter
 * cannot produce a trusted result, Life OS persists the configured safe fallback
 * interpretation instead of inventing meaning or failing the Capture itself.
 */
export class FailClosedCaptureInterpreter implements CaptureInterpreter {
  constructor(
    private readonly primary: CaptureInterpreter,
    private readonly fallback: CaptureInterpreter,
  ) {}

  async interpret(input: CaptureInterpreterInput): Promise<CaptureInterpretationResult> {
    try {
      return await this.primary.interpret(input);
    } catch {
      return this.fallback.interpret(input);
    }
  }
}
