# Life OS — Proposal Creation Persistence V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Change classification:** EXTENSION + REFINEMENT  
**Status:** implementation contract for durable Capture → Interpret → Propose

## Product question

How can Life OS persist what the user said and what the interpreter proposed without allowing browser-controlled structured data, AI failure, retries, concurrency, or partial writes to corrupt the proposal that the user later reviews and applies?

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
3. Preserve the first trusted request receipt time separately from the backend storage time.
4. Commit the Capture.
5. Call the interpreter outside a database transaction using the stored raw text and original trusted receipt time.
6. Validate the interpreter result as non-authoritative proposal data.
7. Lock the stored Capture before the final bundle recheck.
8. Persist one interpretation plus its proposals atomically if no concurrent request already did so.

If interpretation fails, the Capture remains stored and can be reprocessed later. If proposal persistence fails, no partial interpretation/proposal set survives.

## Request idempotency

`(user_id, request_id)` identifies one Capture submission.

- same user + same request ID + same raw text/source → return/reuse the original Capture
- same user + same request ID + different raw text/source → reject as an idempotency collision
- same text under a new request ID → valid new Capture

The raw text is preserved as supplied rather than normalized into a second authoritative form.

The first trusted `received_at` is retained on the Capture. A retry therefore interprets relative language such as “tomorrow” against the original request time instead of silently re-anchoring it to the retry time. `recorded_at` remains the backend persistence clock.

## Interpreter authority

The interpreter is a backend port, not an authority source.

A future implementation may be deterministic parsing, Life OS AI, or a provider-backed adapter. Its output remains OBSERVATION/SUGGESTION data until the appropriate user approval boundary.

The interpreter receives the minimum V1 context required:

- raw Capture text
- original trusted request time

It does not need direct database access or unrestricted user context.

Interpreter-created proposal states are limited to:

- `PROPOSED`
- `NEEDS_CONFIRMATION`
- `READY_TO_APPLY`

The interpreter cannot create `REJECTED` or `APPLIED`: both represent later authoritative outcomes rather than interpretation. `HIGH_AUTHORITY_APPROVAL` proposals cannot be marked ordinary `READY_TO_APPLY` by this boundary.

Runtime validation also rejects unknown interpreter kinds, intents, certainty values, invalid confidence, non-OBSERVATION interpreter observations, unknown operation/domain-owner pairings, duplicate interpreter proposal keys, copied raw source text, and incomplete ready-to-apply Calendar semantics.

## Persisted provenance

V1 stores three durable layers:

### `capture_record`

- server-generated capture ID
- authenticated user ID
- original raw text
- trusted source
- correlation ID
- server request ID
- first trusted receipt time
- backend recorded time

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

Proposal creation may persist only:

- `PROPOSED`
- `NEEDS_CONFIRMATION`
- `READY_TO_APPLY`

`REJECTED` and `APPLIED` require later authoritative actions. `APPLIED` remains the result of a canonical commit transaction.

`HIGH_AUTHORITY_APPROVAL` proposals are always kept out of the ordinary ready-to-apply path and must use their dedicated approval flow.

## Transaction and concurrency boundaries

There are intentionally two transactions around interpretation:

```text
TRANSACTION A
  capture_record
COMMIT
      ↓
interpreter call (no DB transaction held)
      ↓
TRANSACTION B
  lock capture_record FOR UPDATE
  recheck existing routing bundle
  if absent:
    routing_interpretation
    routing_proposal × N
COMMIT
```

This avoids holding a PostgreSQL transaction open across AI/network work while preserving the more important rule that the user's raw Capture survives interpreter failure.

The Capture-row lock serializes proposal-bundle creation for one persisted Capture. Two simultaneous retries may both finish interpretation, but only one creates the durable bundle. The other waits, rechecks after the lock, and returns the already-committed interpretation/proposals as an idempotent replay. A real PostgreSQL concurrency test proves this behavior.

No life-domain event is emitted merely because an interpretation/proposal was created: neither is canonical life truth. The later canonical mutation still follows canonical state + domain event + applied marker + proposal state in one transaction.

## PostgreSQL integrity

The database enforces:

- Capture ownership and request idempotency
- interpretation → Capture ownership
- proposal → interpretation/Capture ownership
- known destinations, operations, trust classes, approval modes and persisted states
- one V1 interpretation version per Capture
- proposal primary-key uniqueness

Proposal creation locks the persisted Capture with `SELECT ... FOR UPDATE` before the final bundle recheck. Apply separately continues to load the selected persisted proposal by authenticated user and lock that proposal before canonical commit.

## Pre-build canonical comparison

- **ALIGNED:** Capture preserves raw user expression before classification.
- **ALIGNED:** interpretation is observation, not canonical truth.
- **ALIGNED:** proposals are suggested consequences, not hidden writes.
- **ALIGNED:** provenance remains inspectable across Capture → interpretation → proposal → later commit.
- **ALIGNED:** core Capture survives AI unavailability.
- **ALIGNED:** authenticated server context owns identity/source/time authority.
- **ALIGNED:** AI receives minimum task-specific context and no direct DB authority.
- **REFINEMENT:** browser-controlled structured proposal data is removed from the durable creation boundary.
- **EXTENSION:** adds durable interpretation/proposal creation, request-level Capture idempotency, and concurrent-retry serialization.
- **NO CONFLICT:** no canonical life state, navigation ownership, high-authority rule, or AI authority changes.

## Post-build comparison

- **ALIGNED:** raw Capture is durable before interpreter/provider work begins.
- **ALIGNED:** interpretation and proposal records remain non-canonical provenance; proposal creation emits no misleading life-domain event.
- **ALIGNED:** the browser contributes raw expression only and cannot choose durable routing semantics.
- **ALIGNED:** trusted user/source/time context remains server-owned.
- **ALIGNED:** original request time survives retries, preserving the meaning of relative temporal language.
- **ALIGNED:** malformed or over-authoritative interpreter output is rejected before persistence.
- **ALIGNED:** proposal-bundle persistence is atomic and concurrent retries resolve to one durable bundle.
- **ALIGNED:** the exact persisted Calendar proposal later flows into the existing user-confirmed canonical Apply boundary.
- **ALIGNED:** raw source text remains in Capture provenance and is not copied into later domain-event payloads.
- **NO HIDDEN RULE:** no new navigation responsibility, autonomous AI write authority, production authentication assumption, or personal-data requirement was introduced.
