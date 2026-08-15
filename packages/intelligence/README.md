# intelligence

Intent routing, context-package construction, retrieval policy, provider abstractions, memory consolidation, and AI trace/provenance logic. This package must never treat vector similarity as canonical truth.

Current Capture interpretation boundary:

- `capture-interpreter.ts` defines the backend interpreter port used after raw Capture persistence.
- The browser supplies raw user text, not authoritative routing/proposal structure.
- Interpreter output remains OBSERVATION/SUGGESTION data and cannot create `REJECTED` or `APPLIED` user states.
- High-authority interpretation never bypasses the dedicated approval boundary.
- The port receives only the raw Capture text and its trusted request time in V1; it has no direct database authority.
- `OpenAiCaptureInterpreter` is an explicit opt-in semantic interpreter. It requests strict structured output but deliberately does not let the model choose durable trust class, approval mode, proposal state, destination ownership, or canonical mutation authority.
- `FailClosedCaptureInterpreter` returns `SafeFallbackCaptureInterpreter` output when the primary provider/model cannot produce a trusted result.
- V1 code policy never promotes an AI-produced proposal to `READY_TO_APPLY`; semantic understanding and commit readiness remain separate reviewed boundaries.
