# Life OS — Proposal Creation Persistence V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Change classification:** EXTENSION + REFINEMENT  
**Status:** implementation contract for durable Capture → Interpret → Propose

## Product question

How can Life OS persist what the user said and what the interpreter proposed without allowing browser-controlled structured data, AI failure, retries, or partial writes to corrupt the proposal that the user later reviews and applies?

## Core boundary

The browser/request owns only the raw user expression and the explicit request to capture it.

```text
RAW USER TEXT
      ↓
SERVER CAPTURE PERSISTENCE
      ↓
SERVER-CONTROLLED INTERPRETER PORT
      ↓
INTERPRETATION (OBSERVATION)
      ↓
ROUTING PROPOSALS (SUGGESTIONS)
      ↓
LATER USER REVIEW / APPLY
```

The browser does not submit authoritative destination, operation, Calendar plan, trust class, proposal state, or interpreter identity.

## Capture-first reliability

Capture is persisted before interpretation runs.

This is deliberate. AI/parser availability must never determine whether the user's original words survive.

1. Validate authenticated request context and non-empty raw text.
2. Persist the raw Capture idempotently using the authenticated user + server request ID.
3. Commit the Capture.
4. Call the interpreter outside a database transaction.
5. Validate the interpreter result as non-authoritative proposal data.
6. Persist one interpretation plus its proposals atomically.

If interpretation fails, the Capture remains stored and can be reprocessed later. If proposal persistence fails, no partial interpretation/proposal set survives.

## Request idempotency

`(user_id, request_id)` identifies one Capture submission.

- same user + same request ID + same raw text/source → return/reuse the original Capture
- same user + same request ID + different raw text/source → reject as an idempotency collision
- same text under a new request ID → valid new Capture

The raw text is preserved as supplied rather than normalized into a second authoritative form.

## Interpreter authority

The interpreter is a backend port, not an authority source.

A future implementation may be deterministic parsing, Life OS AI, or a provider-backed adapter. Its output remains OBSERVATION/SUGGESTION data until the appropriate user approval boundary.

The interpreter receives the minimum V1 context required:

- raw Capture text
- trusted request time

It does not need direct database access or unrestricted user context.

The interpreter is forbidden from producing `APPLIED` proposal state. High-authority proposals cannot be marked ordinary ready-to-apply by this boundary.

## Persisted provenance

V1 stores three durable layers:

### `capture_record`

- server-generated capture ID
- authenticated user ID
- original raw text
- trusted source
- correlation ID
- server request ID
- recorded time

### `routing_interpretation`

- interpretation ID
- Capture/user ownership
- interpreter kind
- intent
- certainty
- confidence
- observations
- optional clarification
- created time

### `routing_proposal`

- server-generated proposal ID
- interpreter-local proposal key for traceability
- Capture + interpretation ownership
- destination
- operation
- summary
- target trust class
- approval mode
- proposal state
- reason
- structured payload JSON
- created/applied references

The original raw text is stored once in `capture_record`. Interpretation and proposal records reference it rather than duplicating it.

## Proposal state safety

Proposal creation may persist:

- `PROPOSED`
- `NEEDS_CONFIRMATION`
- `READY_TO_APPLY`
- `REJECTED`

It may not create `APPLIED`. `APPLIED` remains the result of a later authoritative commit transaction.

`HIGH_AUTHORITY_APPROVAL` proposals are always persisted as requiring confirmation/review, never silently elevated to an ordinary Apply path.

## Transaction boundaries

There are intentionally two transactions around interpretation:

```text
TRANSACTION A
  capture_record
COMMIT
      ↓
interpreter call (no DB transaction held)
      ↓
TRANSACTION B
  routing_interpretation
  routing_proposal × N
COMMIT
```

This avoids holding a PostgreSQL transaction open across AI/network work while preserving the more important rule that the user's raw Capture survives interpreter failure.

No life-domain event is emitted merely because an interpretation/proposal was created: neither is canonical life truth. The later canonical mutation still follows canonical state + domain event + applied marker + proposal state in one transaction.

## PostgreSQL integrity

The database enforces:

- Capture ownership and request idempotency
- interpretation → Capture ownership
- proposal → interpretation/Capture ownership
- known destinations, operations, trust classes, approval modes and states
- one V1 interpretation version per Capture
- proposal primary-key uniqueness

Apply continues to load persisted proposals by authenticated user and lock them with `SELECT ... FOR UPDATE`.

## Pre-build canonical comparison

- **ALIGNED:** Capture preserves raw user expression before classification.
- **ALIGNED:** interpretation is observation, not canonical truth.
- **ALIGNED:** proposals are suggested consequences, not hidden writes.
- **ALIGNED:** provenance remains inspectable across Capture → interpretation → proposal → later commit.
- **ALIGNED:** core Capture survives AI unavailability.
- **ALIGNED:** authenticated server context owns identity/source/time authority.
- **ALIGNED:** AI receives minimum task-specific context and no direct DB authority.
- **REFINEMENT:** browser-controlled structured proposal data is removed from the durable creation boundary.
- **EXTENSION:** adds durable interpretation/proposal creation and request-level Capture idempotency.
- **NO CONFLICT:** no canonical life state, navigation ownership, high-authority rule, or AI authority changes.
