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

It does not accept identity or credentials from query parameters, request body, custom user-ID headers, or Capture/proposal payload fields.

The Bearer credential is passed into the existing `SessionVerifier` boundary. The verified `userId` is the only identity source. The trusted backend also creates `receivedAt`, request ID, and source=`WEB_APP`; these values are never taken from client alternatives.

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

Nonexistent and cross-user private resources both return HTTP 404 with `{ "status": "not_found" }`. The response must not disclose whether the Capture exists for another user.

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

- 401 → `{ "status": "authentication_required" }`
- 503 → `{ "status": "authentication_unavailable" }`
- 404 → `{ "status": "not_found" }`
- 405 → `{ "status": "method_not_allowed" }`
- 500 → `{ "status": "internal_error" }`

Raw exception/database/provider messages are not returned.

## Technical telemetry

Authenticated read operations use `runInstrumentedOperation`. Allowed references are limited to server-generated request ID and Capture ID from the route.

Telemetry may record `GET_PROPOSAL_REVIEW`, `GET_INTERACTION_TRACE`, SUCCESS / UNAVAILABLE / FAILED, duration, runtime/release provenance, and stable machine error code.

It receives no Bearer credential, verified user ID, raw Capture source, proposal summary/reason or event payload.

## PostgreSQL proof

The integration test creates an isolated schema, migrations 0001→current, a login-capable non-owner/non-superuser/`NOBYPASSRLS` application role, one synthetic owner Capture/proposal, two synthetic session credentials, the actual PostgreSQL readers, and the actual HTTP server.

It proves owner access, cross-user 404, cross-user/nonexistent indistinguishability, unauthenticated 401, unscoped application-role zero-row visibility, and telemetry privacy.

## Deployment stop condition

**This V1 transport is not wired into `apps/api/src/main.ts`.**

The deployed process remains health-only until a real session verifier is deliberately selected/configured and its credential lifecycle is tested. This prevents a test verifier or implicit trust mechanism from becoming production authentication by accident.

The future composition step must explicitly provide a production/development `SessionVerifier`, secret/configuration validation, origin/CORS/cookie policy if browser credentials require it, private transport dependencies, and hosted smoke tests proving authenticated owner and cross-user denial.

## Not introduced

- production Supabase Auth integration;
- browser session/cookie design;
- private routes in running `main.ts`;
- Capture POST endpoint;
- Apply endpoint;
- Reject endpoint;
- CORS/CSRF policy;
- real personal data;
- external hosted resources.

V1 only proves the private read composition contract against synthetic data and real PostgreSQL authorization.
