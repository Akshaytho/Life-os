# Life OS — Private Runtime Composition V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `DEVELOPMENT_DEPLOYMENT_V1.md`, `PRIVATE_API_COMPOSITION_V1.md`, `SUPABASE_SESSION_VERIFIER_V1.md`, `SAFE_FALLBACK_CAPTURE_V1.md`  
**Classification:** ALIGNED + IMPLEMENTATION  
**Status:** repository runtime implemented; external hosted-development resources remain uncreated/unconfigured

## Goal

Compose the already-reviewed Life OS private transport into one long-running API process without making deployment itself a new authority boundary.

V1 combines:

```text
public health routes
       +
explicit private-runtime activation gate
       +
Supabase user-session verification
       +
least-privileged PostgreSQL application pool
       +
per-user transaction-local RLS scope
       +
Safe Fallback Capture interpreter
       +
reviewed Capture / Review / Trace / Apply / Reject routes
```

No browser persistence or production activation is introduced by this slice.

## Activation gate

Private routes are disabled by default.

```text
LIFE_OS_PRIVATE_API_ENABLED=false   health-only
LIFE_OS_PRIVATE_API_ENABLED=true    compose private runtime, subject to all safety checks
```

Only the literal values `true` and `false` are accepted.

V1 refuses `LIFE_OS_PRIVATE_API_ENABLED=true` when `LIFE_OS_ENVIRONMENT=production`. Production activation requires a separate review and is not implied by successful hosted development.

The presence of `DATABASE_URL` or Supabase credentials alone never enables private routes.

## Long-running server

`createLifeOsApiServer(...)` owns one Node HTTP server.

Public routes:

- `GET|HEAD /health/live`
- `GET|HEAD /health/ready`

Optional private routes, only when private dependencies are composed:

- `POST /api/v1/captures`
- `GET /api/v1/captures/:captureId/review`
- `GET /api/v1/interactions/:captureId/trace`
- `POST /api/v1/proposals/:proposalId/apply`
- `POST /api/v1/proposals/:proposalId/reject`

When private runtime is disabled, those same private route shapes return the minimal ordinary `404 not_found` response instead of advertising an inactive API surface.

No debug/env route is added.

## Concrete private dependencies

`createPrivateApiRuntimeDependencies(...)` accepts only the ordinary application `Pool`, runtime provenance, technical telemetry sink and provider-neutral test overrides.

Production defaults are:

- `createSupabaseSessionVerifierFromEnv(...)`
- `PostgresWriteUnitOfWork`
- `PostgresProposalReviewReader`
- `PostgresInteractionChangeLedgerReader`
- `SafeFallbackCaptureInterpreter`
- backend `randomUUID()` identifiers
- backend wall clock
- monotonic operation timer

The factory has no parameter for `MIGRATION_DATABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`.

## Database authority readiness

A private runtime does not treat `SELECT 1` as sufficient proof that its database credential is safe.

Before the server listens, and again through `/health/ready`, `createPrivateDatabaseReadinessProbe(...)` verifies the connected application role itself.

Required private tables:

- `capture_record`
- `routing_interpretation`
- `routing_proposal`
- `calendar_event`
- `domain_event`
- `applied_proposal`
- `proposal_rejection`

For all seven tables the probe requires:

- table exists in the active application schema;
- row-level security is enabled;
- `FORCE ROW LEVEL SECURITY` is enabled;
- current application role does not own the table.

For the connected role the probe also requires:

- `rolsuper = false`;
- `rolbypassrls = false`.

Finally, without setting any user context, it requires:

```text
lifeos_current_user_id() IS NULL
visible capture rows = 0
```

A superuser, bypass-RLS role, table owner, incomplete migration set, missing FORCE RLS, leaked user scope or visible unscoped Capture data therefore makes the private runtime not ready.

If the initial private readiness check fails, `main.ts` fails bootstrap before listening.

## Authentication boundary

When private runtime is enabled and no test verifier is injected, startup constructs the reviewed Supabase session verifier.

Required provider configuration:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`, preferred; or legacy `SUPABASE_ANON_KEY`

The private application runtime does not need:

- `SUPABASE_SERVICE_ROLE_KEY`
- a JWT signing secret
- a migration/admin database credential

Verified provider `user.id` remains the only caller identity admitted into `TrustedWebRequestContext`.

## AI-unavailable behavior

V1 intentionally uses `SafeFallbackCaptureInterpreter` as the production runtime default.

That means enabling the private API does **not** quietly turn prototype sample routing into production intelligence and does not require `OPENAI_API_KEY`.

Until a production Life OS AI interpreter is separately reviewed, Capture remains useful but semantically conservative:

```text
raw Capture
   ↓
SAFE_FALLBACK
   ↓
RAW_THOUGHT
   ↓
BRAIN_DUMP / KEEP_RAW_CAPTURE proposal
   ↓
PROPOSED
   ↓
no canonical mutation
```

## Startup sequence

When private runtime is disabled:

```text
resolve runtime provenance
      ↓
optional DATABASE_URL health probe
      ↓
start health-only server
```

When private runtime is enabled:

```text
resolve runtime provenance
      ↓
validate explicit activation + non-production environment
      ↓
require DATABASE_URL
      ↓
construct real Supabase verifier
      ↓
construct ordinary PostgreSQL repositories
      ↓
prove least-privileged role + FORCE RLS + empty unscoped scope
      ↓
only then listen with health + private routes
```

Bootstrap failures remain sanitized and never echo connection strings, Supabase keys or provider error bodies.

## PostgreSQL integration proof

`private-runtime.integration.ts` creates a disposable schema and a distinct synthetic application role:

- `NOSUPERUSER`
- `NOBYPASSRLS`
- non-owner
- only required schema/table/function grants

It applies migrations `0001` through `0006`, then proves:

1. strict private readiness passes;
2. `/health/live` and `/health/ready` succeed;
3. an authenticated synthetic Capture reaches the composed private server;
4. runtime default interpreter is `SAFE_FALLBACK`;
5. review exposes the source separately from the fallback observation/proposal;
6. Brain Dump proposal remains `PROPOSED`;
7. Calendar, domain-event and applied-proposal tables remain empty;
8. unscoped application-role reads remain hidden;
9. raw source, session token, user ID and idempotency key are absent from technical telemetry.

## Deliberate non-goals / stop conditions

This slice still does not create or configure:

- a Supabase project;
- a Railway service/environment;
- real secrets;
- real personal data;
- browser sign-in/session acquisition;
- browser API mutation wiring;
- cross-origin/CORS policy;
- CSRF policy for cookie-based authentication;
- production Life OS AI;
- production private API activation;
- service-role/admin data paths.

The next external step is hosted-development environment setup with synthetic data first. Browser wiring remains a separate reviewed slice because its origin/session policy depends on the actual deployment topology.
