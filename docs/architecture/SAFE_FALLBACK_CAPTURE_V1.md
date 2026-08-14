# Life OS — Safe Fallback Capture V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `INPUT_ROUTING_V1.md`, `PRIVATE_API_COMPOSITION_V1.md`  
**Classification:** ALIGNED + IMPLEMENTATION  
**Status:** safe non-AI interpreter available; runtime activation remains separate

## Goal

Keep private Capture useful when no trusted semantic interpreter is available, without pretending to understand the user's words and without granting fallback logic canonical authority.

The product routing contract already requires an AI-unavailable mode where raw text can remain a Brain Dump candidate. This slice makes that behavior explicit in backend provenance and persistence.

## New interpreter identity

Routing interpreter provenance is now a shared type:

```text
LOCAL_SAMPLE   prototype/demo routing only
SAFE_FALLBACK  production-safe non-semantic fallback
LIFE_OS_AI      trusted semantic AI interpreter
```

`SAFE_FALLBACK` is deliberately different from `LOCAL_SAMPLE`. Hosted/private runtime must not label deterministic fallback behavior as sample AI or as Life OS AI.

Migration `0006_safe_fallback_interpreter.sql` extends the persisted `routing_interpretation.interpreter` constraint accordingly.

## Safe fallback behavior

Given any valid raw Capture text, `SafeFallbackCaptureInterpreter` returns the same non-semantic structured result:

- interpreter: `SAFE_FALLBACK`
- intent: `RAW_THOUGHT`
- certainty: `UNSPECIFIED`
- confidence: `0`
- one generic observation stating that no trusted semantic interpretation was performed
- one `BRAIN_DUMP / KEEP_RAW_CAPTURE` proposal
- proposal state: `PROPOSED`
- proposed result class: `SUGGESTION`

It does not infer calendar dates, health meaning, goals, learning, decisions, identity, drift, travel, or any other domain semantics.

## Raw-source privacy

The user's original text remains in `capture_record.raw_text`, where provenance already belongs.

The fallback does **not** copy or paraphrase that text into:

- observations
- proposal summary
- proposal reason
- proposal payload JSON
- technical telemetry

This reduces unnecessary duplication of private content while keeping the original source inspectable through authenticated review.

## Authority boundary

Safe fallback creates no canonical life-state mutation and no domain event.

```text
raw user Capture
      ↓
SAFE_FALLBACK
      ↓
RAW_THOUGHT observation
      ↓
BRAIN_DUMP / KEEP_RAW_CAPTURE proposal
      ↓
PROPOSED only
      ↓
0 Calendar writes
0 domain events
```

The proposal is not marked `READY_TO_APPLY` because Life OS does not yet have a reviewed canonical Brain Dump apply operation. A future owner-specific persistence slice may define that operation deliberately.

## PostgreSQL/RLS proof

The private API integration fixture now applies migrations through `0006` and can substitute a Capture interpreter.

The fallback integration proof verifies:

- authenticated Capture persists through the normal private API;
- `SAFE_FALLBACK` is accepted by the real PostgreSQL constraint;
- the Brain Dump proposal persists under the existing per-user RLS scope;
- authenticated review exposes the original source separately from generic interpretation/proposal metadata;
- structured fallback metadata does not contain the original raw text;
- no Calendar row, domain event or applied-proposal row is created;
- unscoped application-role reads remain hidden;
- raw text, session token, user identity and idempotency key do not leak into technical telemetry.

## Runtime stop condition

This slice still does **not** wire the private router into `apps/api/src/main.ts`.

It removes one blocker for runtime composition: Capture now has a truthful non-AI interpreter that is safe to use when semantic AI is unavailable.

The remaining runtime slice must still compose:

- health/liveness/readiness;
- real Supabase session verification;
- least-privileged PostgreSQL adapters;
- server-owned clock and IDs;
- `SafeFallbackCaptureInterpreter` as the non-AI Capture interpreter;
- reviewed private API routing;
- synthetic end-to-end runtime smoke coverage;
- fail-closed hosted configuration.
