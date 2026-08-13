# Life OS — Private Read Transport V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** trusted transport auth, PostgreSQL RLS adapters, Interaction & Change Ledger V1, Operation Telemetry V1  
**Classification:** ALIGNED + EXTENSION

## Purpose

Establish the first private HTTP composition boundary without exposing canonical write actions before a production session provider exists.

V1 exposes only authenticated reads for:

- proposal review;
- Interaction & Change trace.

It deliberately does **not** expose Capture creation, Apply, Reject, Calendar mutation, Memory mutation, MCP, debug environment data or generic SQL access.

## Routes

```text
GET /api/v1/captures/:captureId/review
GET /api/v1/interactions/:captureId/trace
```

The identifier must be a bounded opaque technical ID. Free-form prose and encoded path traversal are rejected before authentication/data access.

Known read routes accept GET only. Unknown/write-looking routes remain 404.

## Authentication

V1 accepts one credential location:

```text
Authorization: Bearer <opaque-session-credential>
```

It does not accept identity or credentials from:

- query parameters;
- request body;
- `x-user-id` / `x-life-os-user` style headers;
- Capture/proposal payload fields.

The Bearer credential is passed into the existing `SessionVerifier` boundary. The verified `userId` is the only identity source.

The trusted backend also creates:

- `receivedAt`;
- request ID;
- source = `WEB_APP`.

These values are never taken from client-supplied alternatives.

## Authorization / RLS chain

```text
Bearer credential
      ↓
SessionVerifier
      ↓
trusted user principal
      ↓
proposal review / interaction trace application service
      ↓
PostgresProposalReviewReader / PostgresInteractionChangeLedgerReader
      ↓
PostgresUserScope
      ↓
SET LOCAL lifeos.user_id
      ↓
explicit user_id predicate + FORCE RLS
```

A different authenticated user receives no private row.

## Existence privacy

Nonexistent and cross-user private resources both return:

```json
{ "status": "not_found" }
```

with HTTP 404.

The HTTP response must not disclose whether the Capture exists for another user.

Technical telemetry may record the route operation as `UNAVAILABLE`, but it contains no user ID or private source text.

## Response privacy

Every private response uses:

- `Cache-Control: private, no-store`;
- `Pragma: no-cache`;
- `Vary: Authorization`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`.

The successful response may contain private Life OS data because it is an authenticated product response. The same data must not be copied into developer telemetry.

## Error mapping

### 401

Missing, malformed, invalid or expired credential:

```json
{ "status": "authentication_required" }
```

### 503

Session verification provider unavailable:

```json
{ "status": "authentication_unavailable" }
```

No provider exception detail is returned.

### 404

Unknown route, invalid opaque path identifier, nonexistent resource or cross-user resource:

```json
{ "status": "not_found" }
```

### 405

Mutation method on a known read route:

```json
{ "status": "method_not_allowed" }
```

### 500

Unexpected application/database invariant failure:

```json
{ "status": "internal_error" }
```

Raw exception/database/provider messages are not returned.

## Technical telemetry

Authenticated read operations use `runInstrumentedOperation`.

Allowed technical references are limited to:

- server-generated request ID;
- Capture ID from the route.

Telemetry may record:

- `GET_PROPOSAL_REVIEW`;
- `GET_INTERACTION_TRACE`;
- SUCCESS / UNAVAILABLE / FAILED;
- duration;
- runtime/release provenance;
- stable machine error code.

It receives no Bearer credential, verified user ID, raw Capture source, proposal summary/reason or event payload.

Authentication failures are not yet emitted into this operation telemetry stream; a future security-observability slice may add credential-safe auth outcome metrics separately.

## PostgreSQL proof

The integration test creates:

- isolated schema;
- real migrations 0001 → current;
- login-capable non-owner / non-superuser / `NOBYPASSRLS` application role;
- one synthetic owner Capture/proposal;
- two synthetic session credentials mapping to different users;
- actual PostgreSQL proposal-review and Interaction-Ledger readers;
- actual HTTP server.

It proves:

- owner token returns private proposal review;
- owner token returns private Interaction trace;
- other-user token receives 404 for the owner's Capture;
- other-user 404 is the same shape as a nonexistent Capture;
- unauthenticated request receives 401;
- unscoped application-role SQL sees zero private Capture/proposal rows;
- technical telemetry contains neither credential, user ID nor raw source text.

## Deployment stop condition

**This V1 transport is not wired into `apps/api/src/main.ts`.**

The deployed process remains health-only until a real session verifier is deliberately selected/configured and its credential lifecycle is tested.

This prevents a test fixture verifier or implicit trust mechanism from becoming production authentication by accident.

The future composition step must explicitly provide:

- production/development `SessionVerifier` implementation;
- secret/configuration validation;
- origin/CORS/cookie policy if browser credentials require it;
- private transport dependencies;
- smoke tests proving authenticated owner and cross-user denial.

## Not introduced

- production Supabase Auth integration;
- browser session/cookie design;
- private routes in running `main.ts`;
- Capture POST endpoint;
- Apply endpoint;
- Reject endpoint;
- CORS policy;
- CSRF policy;
- real personal data;
- external hosted resources.

V1 only proves the private read composition contract against synthetic data and real PostgreSQL authorization.
