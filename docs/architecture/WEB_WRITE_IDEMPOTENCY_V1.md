# Life OS — Web Write Idempotency V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Classification:** ALIGNED + EXTENSION

## Purpose

A future private Capture HTTP mutation must be safe when the network retries the same logical action.

Capture persistence already deduplicates by `(user_id, request_id)`, while the trusted web boundary creates a fresh server request ID for every transport request. V1 adds a distinct retry identity before any private Capture POST route is exposed.

## Transport rule

A future Capture request may provide an opaque `Idempotency-Key` for deduplication only.

It cannot choose user identity, source, trusted receive time, database/RLS scope, routing destination, approval authority or canonical state.

Authentication and trusted request-context creation happen first. Only then can Life OS derive an internal request ID from authenticated user + operation scope + opaque key.

## Internal derivation

`withWebWriteIdempotency(...)` hashes:

- version 1;
- authenticated user ID;
- operation scope (`CAPTURE_CREATE` in V1);
- raw retry key.

The application receives:

`web-idem-v1:capture_create:<sha256>`

The raw key is not the persisted request ID and is not returned as provenance.

## Validation and privacy

V1 keys are bounded opaque tokens: 16–128 characters using alphanumeric plus dot, underscore, colon or hyphen, with an alphanumeric first character.

The raw retry key must not be persisted in Capture rows, copied into the Interaction Ledger, emitted in technical telemetry, or treated as an authentication credential.

## Retry semantics

### Same authenticated user + same key + same body

The second request derives the same internal request ID, finds the existing Capture, and returns the already-persisted interpretation/proposals with `idempotentReplay = true`. Interpretation does not run again after a complete routing bundle exists.

### Same authenticated user + same key + different body

This is not a valid replay. Life OS rejects it with Capture content-integrity error and preserves the original Capture unchanged.

### Different authenticated users + same raw key

The derived internal IDs differ because authenticated user identity participates in the derivation. RLS and `(user_id, request_id)` uniqueness remain isolated per user.

## Time semantics

The first successful Capture keeps its original trusted `receivedAt`. A later transport retry does not rewrite the occurrence time to the retry time.

## Why Apply/Reject are separate

Apply and Reject already have stronger domain-specific terminal idempotency through persisted `APPLIED` / `REJECTED` state and their provenance markers. V1 therefore addresses Capture creation only rather than replacing domain semantics with one generic retry mechanism.

## PostgreSQL proof

The integration suite uses a real login-capable non-owner / non-superuser / `NOBYPASSRLS` application role and proves:

- one persisted Capture/interpretation/proposal for same user/key/body retries;
- interpreter runs once;
- replay returns original IDs;
- raw retry key is absent from persisted request ID;
- original receive time remains unchanged;
- different body with same logical key is rejected;
- the same raw key across users remains isolated;
- unscoped application-role reads still see zero private rows.

## Next transport boundary

A future Capture POST route may compose:

`Bearer session → trusted context → Idempotency-Key derivation → captureAndPropose → privacy-safe telemetry → sanitized HTTP response`

This slice does **not** add that route, change `main.ts`, introduce production Auth, expose Apply/Reject HTTP writes, or create hosted resources.
