# Life OS — Private Capture POST V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** trusted transport auth, Web Write Idempotency V1, Capture persistence, PostgreSQL RLS, Operation Telemetry V1  
**Classification:** ALIGNED + EXTENSION

## Purpose

Prove the first private HTTP mutation boundary without exposing proposal Apply/Reject or bypassing the existing trust model.

V1 route:

```text
POST /api/v1/captures
```

The route creates one logical raw Capture and its persisted interpretation/proposals. It does **not** apply any proposal to Calendar, Journey, Memory, You or other canonical domain state.

## Authority chain

```text
Bearer credential
      ↓
SessionVerifier
      ↓
trusted server user / receivedAt / request context
      ↓
required opaque Idempotency-Key
      ↓
server-derived logical request ID
      ↓
Capture raw USER SOURCE persisted
      ↓
interpreter OBSERVATION
      ↓
routing SUGGESTION(s)
      ↓
response for later review
```

The client cannot provide trusted user identity, source, receive time, PostgreSQL scope or approval authority.

## Request

### Authentication

Only:

```text
Authorization: Bearer <opaque-session-credential>
```

Identity-like query/body/custom headers are never trusted.

### Idempotency

A valid `Idempotency-Key` is required after authentication. The raw key is transformed by `withWebWriteIdempotency(..., "CAPTURE_CREATE", key)` and never reaches persistence or telemetry.

### Content type

`application/json` is required. Optional charset is accepted. Compressed/unsupported request encodings are not part of V1.

### Body

Exactly:

```json
{
  "rawText": "..."
}
```

Unknown top-level fields are rejected rather than ignored. This makes attempts to submit `userId`, `source`, `receivedAt`, approval flags or other authority-looking fields fail visibly.

V1 limits:

- JSON body: 8 KiB maximum;
- `rawText`: non-empty after trim;
- `rawText`: at most 800 JavaScript characters, matching the current Capture UI boundary;
- exact source text is preserved rather than trimmed before persistence.

## Response

### First successful logical Capture

HTTP 201:

```json
{
  "status": "created",
  "captureId": "...",
  "correlationId": "...",
  "interpretationId": "...",
  "proposalIds": ["..."],
  "proposalStates": ["..."],
  "clarification": "optional"
}
```

### Exact retry

HTTP 200 with `status = "replayed"` and the same persisted Capture/proposal identifiers.

The original first trusted `receivedAt` remains the Capture occurrence time.

### Same idempotency key with different Capture content

HTTP 409:

```json
{ "status": "idempotency_conflict" }
```

The original Capture remains unchanged.

## Error mapping

- 401 `authentication_required` — missing/malformed/invalid session
- 503 `authentication_unavailable` — verifier/provider unavailable
- 415 `unsupported_media_type` — not JSON / unsupported content encoding
- 400 `invalid_idempotency_key` — missing/malformed retry token
- 413 `request_too_large` — body exceeds V1 limit
- 400 `invalid_request` — malformed JSON, wrong object shape, unknown fields, invalid rawText
- 409 `idempotency_conflict` — same logical retry identity rebound to different Capture text
- 500 `capture_processing_failed` — unexpected interpreter/persistence invariant failure
- 404 `not_found` — unknown route
- 405 `method_not_allowed` — wrong method on the known Capture route

Provider/database/interpreter exception messages are never returned.

## Authentication before body work

The route verifies the Bearer credential before reading/parsing the private request body. An unauthenticated caller therefore does not get body-validation detail and does not consume interpreter/database work.

Route/method recognition occurs first so unknown surfaces remain 404 and known non-POST use 405.

## PostgreSQL / RLS

The route calls the existing `captureAndPropose` application service through `PostgresWriteUnitOfWork`.

Every private transaction remains:

```text
authenticated user
      ↓
PostgresUserScope
      ↓
transaction-local lifeos.user_id
      ↓
explicit user predicates + FORCE RLS
```

HTTP idempotency does not weaken that ownership boundary.

## Technical telemetry

`CAPTURE_AND_PROPOSE` may emit:

- release/runtime provenance;
- duration;
- derived server request ID;
- resulting Capture/correlation ID;
- success/rejected/failed machine outcome.

It must not receive:

- Bearer token;
- raw `Idempotency-Key`;
- raw Capture text;
- verified user ID;
- proposal payload/reason;
- provider/database/interpreter exception text.

A telemetry sink failure cannot change the Capture result.

## Interaction & Change Ledger

A successful Capture POST creates the source/interpretation/proposal portion of one future Interaction & Change trace.

Network retries reuse that same logical interaction instead of creating duplicate source histories.

No canonical domain event is created merely by Capture/routing.

## V1 deployment stop condition

This transport is implemented/tested as a composable server but is **not wired into `apps/api/src/main.ts`**.

The running API remains health-only until a real development/production `SessionVerifier` is deliberately selected and hosted owner/cross-user/retry smoke tests are available.

## Tests required before merge

Unit/HTTP tests:

- authenticated 201 create;
- exact retry 200 replay;
- same key/different body 409;
- same raw key across users remains isolated;
- missing/invalid key rejected;
- authentication occurs before malformed-body processing;
- strict JSON shape rejects forged authority fields;
- body/rawText limits;
- sanitized interpreter/database failure;
- telemetry excludes raw source/key/token/user.

PostgreSQL integration:

- actual HTTP server + non-owner/non-superuser/`NOBYPASSRLS` role;
- owner create + exact replay creates one Capture bundle;
- conflicting retry writes nothing new;
- same raw key for second authenticated user creates an independent owner-scoped Capture;
- unscoped app role still sees zero private rows;
- no domain event / canonical Calendar write occurs.

## Not introduced

- proposal Apply HTTP route;
- proposal Reject HTTP route;
- live browser Capture wiring;
- production Supabase Auth provider;
- CORS/cookie/CSRF browser-session policy;
- main API private-route wiring;
- hosted resources;
- real personal data.
