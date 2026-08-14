# Life OS — Supabase Session Verifier V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `TRUSTED_TRANSPORT_AUTH_V1.md`, `DEVELOPMENT_DEPLOYMENT_V1.md`, ADR-005  
**Classification:** ALIGNED + IMPLEMENTATION  
**Status:** provider adapter implemented; private runtime activation remains blocked

## Why

Life OS already has a provider-neutral `SessionVerifier` boundary. Private Capture, review/trace and proposal-action transports trust only the user identity returned by that verifier.

The development deployment contract requires a **real authentication session** before those private transports are wired into the long-running API server. ADR-005 selected Supabase Auth as the initial managed authentication provider.

This slice implements that missing provider adapter without changing runtime authority.

## Verification flow

For one opaque browser access token:

```text
Authorization: Bearer <Supabase user JWT>
                 ↓
Life OS bearer extraction
                 ↓
SupabaseSessionVerifier
                 ↓
GET <SUPABASE_URL>/auth/v1/user
  apikey: <publishable/anon API key>
  Authorization: Bearer <same user JWT>
                 ↓
HTTP 200 + non-empty user.id
                 ↓
VerifiedUserSession { userId }
                 ↓
server-owned TrustedWebRequestContext
```

The user ID is never accepted from request JSON, query parameters or a client-selected identity header.

## Why the Auth user endpoint

Supabase supports local JWT verification when a project uses suitable asymmetric signing keys, but projects may also use legacy/shared-secret signing. Supabase documents direct verification with the Auth server through `GET /auth/v1/user` using an API key plus the user's bearer JWT.

V1 deliberately uses that provider endpoint because it gives one verification path across both signing-key modes and does not require Life OS to possess a JWT signing secret.

A later optimization may introduce locally cached JWKS verification, but only if it preserves issuer/audience/expiry validation and has a safe fallback for projects whose signing mode requires server verification.

## Configuration

Required when this verifier is instantiated:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`, preferred; or legacy `SUPABASE_ANON_KEY` fallback

Not used by ordinary session verification:

- `SUPABASE_SERVICE_ROLE_KEY`
- `MIGRATION_DATABASE_URL`
- any JWT signing secret

The publishable/anon API key identifies the Supabase project to its API gateway. The user's access token remains the authentication credential whose validity and identity are being checked.

## Failure semantics

The provider-neutral `SessionVerifier` contract distinguishes two classes:

### Unusable session

Return `undefined` for known authentication failures:

- 400
- 401
- 403
- blank credential

The outer trusted-transport boundary converts this to the generic Life OS `Authentication required` response.

### Verification unavailable

Throw a sanitized provider error for conditions where Life OS cannot safely decide whether the credential is valid:

- network/fetch failure
- redirect attempt
- rate limiting
- timeout-like/upstream failure status
- unexpected provider HTTP status
- malformed success JSON
- successful response without a non-empty string user ID

The outer trusted-transport boundary converts this to the generic Life OS `Authentication service unavailable` response.

This prevents a provider outage from being silently misrepresented as a bad user session.

## Credential privacy

V1 intentionally:

- sends the user JWT only in the `Authorization` header;
- never puts the JWT in the URL or query string;
- rejects redirects so credentials are not intentionally forwarded to a second location;
- does not log tokens, provider bodies or underlying network errors;
- returns only the verified `userId` into Life OS;
- does not copy email, phone, metadata or other Supabase user fields into trusted request context.

Technical telemetry remains free of bearer-token material.

## Authority boundary

This verifier authenticates **who is calling**. It does not authorize a domain mutation by itself.

After authentication, Life OS still requires the existing chain:

```text
verified user
   ↓
per-user PostgreSQL RLS scope
   ↓
Capture / proposal
   ↓
explicit confirmation when required
   ↓
application service
   ↓
canonical mutation + append-only domain event atomically
```

Supabase Auth therefore does not bypass proposal/confirmation policy, application services, PostgreSQL RLS, or domain-event provenance.

## Runtime stop condition

This slice does **not** wire `createPrivateApiHandler` into `apps/api/src/main.ts`.

Before private hosted development is activated, the next runtime slice must deliberately compose:

- health/liveness/readiness;
- this real Supabase session verifier;
- least-privileged PostgreSQL write/read adapters;
- the reviewed private API router;
- server-owned request IDs and clock;
- safe startup configuration failures;
- synthetic end-to-end smoke coverage.

Until that composition is reviewed, the running API remains health-only.

## Test obligations

The verifier regression suite proves:

- the expected Supabase Auth URL and headers are used;
- the token is absent from the request URL;
- verified identity comes only from provider `user.id`;
- invalid credentials return no session;
- rate limits/upstream/network failures are treated as unavailable;
- malformed success responses cannot authenticate a caller;
- provider/network details and bearer tokens do not appear in thrown messages;
- publishable-key configuration is preferred with legacy anon-key fallback;
- unsafe/missing provider configuration fails closed.
