# Life OS — Development Deployment V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Classification:** ALIGNED + EXTENSION  
**Status:** repository runtime prerequisites implemented — no external hosted resources or secrets created

## Goal

Prepare a trustworthy hosted **development** environment without turning deployment convenience into a new authority/security model.

The intended topology remains:

```text
Life OS Web
     ↓ HTTPS
Railway Life OS API
     ↓ trusted backend DB connection
Supabase PostgreSQL
```

Life OS private domain writes continue to go through application services, authenticated request context, proposal/approval rules, transactional domain events, and PostgreSQL RLS.

## Current repository checkpoint

The repository now has the executable API prerequisites that were previously missing:

- one long-running HTTP server that listens on platform `PORT`;
- liveness and readiness routes;
- reviewed private Capture/read/proposal-action routes;
- real Supabase session verification;
- least-privileged PostgreSQL adapters with transaction-local user RLS scope;
- Safe Fallback Capture when semantic AI is unavailable;
- strict application-role/RLS readiness;
- technical runtime provenance and sanitized telemetry;
- synthetic PostgreSQL integration coverage for the composed runtime.

Private routes are still **disabled by default**. V1 requires explicit `LIFE_OS_PRIVATE_API_ENABLED=true` and refuses production activation.

See:

- `PRIVATE_API_COMPOSITION_V1.md`
- `SUPABASE_SESSION_VERIFIER_V1.md`
- `SAFE_FALLBACK_CAPTURE_V1.md`
- `PRIVATE_RUNTIME_COMPOSITION_V1.md`

## Current external stop condition

**Do not claim a live Railway/Supabase development deployment yet.**

This repository work does not create external resources, buy a service, provision credentials, apply migrations to a hosted database, or wire a browser session.

A real hosted-development activation still requires:

1. a dedicated Supabase development project;
2. a dedicated Railway development service/environment;
3. separate development-only credentials;
4. migrations `0001` through current applied deliberately with the migration credential;
5. a least-privileged non-owner `NOBYPASSRLS` application role;
6. Supabase Auth configuration and a browser-safe publishable/anon key;
7. Railway variables for release identity, application `DATABASE_URL`, Supabase URL/key, and the explicit private-runtime flag;
8. successful strict `/health/ready` proof;
9. a synthetic Capture → Review → Trace smoke flow before any personal test data;
10. browser origin/session policy reviewed separately before browser mutations are enabled.

## Environment ladder

### Local

- fake/sample web state may remain available;
- in-memory and local/disposable PostgreSQL tests;
- health-only API works without a database;
- private API may be explicitly enabled only with the reviewed auth/database prerequisites;
- no production personal data required;
- release may be `local-unversioned`.

### CI

- disposable PostgreSQL service;
- synthetic fixtures only;
- migrations tested from zero;
- security/RLS tests run with non-owner roles;
- composed private runtime integration uses a distinct synthetic application role/schema;
- release identity comes from CI commit SHA.

### Hosted development — next external stage

- dedicated Supabase development project;
- dedicated Railway development environment/service;
- synthetic/non-sensitive data first;
- separate development credentials;
- migrations `0001` → current applied in order;
- Railway backend uses a least-privileged application database credential;
- `LIFE_OS_PRIVATE_API_ENABLED=true` only after strict readiness can pass;
- deployment/release identity attached to technical telemetry.

### Production — later

Production is a separate environment with separate project/service/credentials and is not created merely because development deployment works.

Private Runtime Composition V1 explicitly rejects production private-API activation.

## Supabase PostgreSQL connection model

Supabase provides multiple Postgres connection modes. For a persistent backend service, prefer a direct Postgres connection when network reachability supports it. If the runtime network requires IPv4, Supavisor session mode is an appropriate persistent-client alternative.

Do not choose transaction-pooler mode casually for this backend. Life OS intentionally uses multi-statement SQL transactions and transaction-local `set_config('lifeos.user_id', ..., true)` RLS context. The selected connection mode must preserve one database session/transaction for the complete `PostgresUserScope.run(...)` callback.

The connection mode is therefore validated during development-environment setup rather than hard-coded in source control.

## Two database credentials, two jobs

Hosted development separates schema administration from ordinary application traffic.

### Migration credential

`MIGRATION_DATABASE_URL` — server/CI/operator only.

Used only for:

- applying ordered migrations;
- creating/updating tables, functions, constraints, policies and app roles;
- controlled maintenance requiring schema-owner authority.

The running API does not accept this credential in its private-runtime dependency factory.

### Application credential

`DATABASE_URL` — Railway API only.

The application database role must remain:

- login-capable only when needed by the backend connection;
- non-superuser;
- non-table-owner;
- `NOBYPASSRLS`;
- granted only required schema/function/table privileges;
- inaccessible to browser JavaScript.

Every private transaction still binds the authenticated Life OS user into transaction-local `lifeos.user_id` before SQL is exposed to application repositories.

Private-runtime readiness verifies the important role/table properties before the server listens.

## Supabase keys

Supabase Auth verification uses a browser-safe publishable key, with legacy anon-key fallback where necessary.

That project key does not grant the browser authority to bypass the Life OS application write model.

`SUPABASE_SERVICE_ROLE_KEY`, if ever required for a narrowly defined administrative integration, remains server-only and must not become the ordinary private-data access path. Private Runtime Composition V1 does not consume it.

The current private application model is:

```text
verified Supabase user session
        ↓
Railway Life OS API
        ↓
least-privileged PostgreSQL role
        ↓
transaction-local user scope + FORCE RLS
        ↓
application services / proposals / domain events
```

## Railway service requirements

For hosted development the service must:

1. build from the shared npm monorepo without copying secrets into the image;
2. start one long-running API process;
3. listen on Railway's injected `PORT`;
4. expose lightweight `/health/live`;
5. expose `/health/ready` with strict private-role/RLS checks when private runtime is enabled;
6. fail startup for missing required hosted configuration;
7. receive `DATABASE_URL` and other secrets only through Railway variables;
8. never return environment-variable dumps through debug routes;
9. carry release/deployment provenance into technical telemetry;
10. keep user-facing Interaction & Change Ledger data separate from technical logs;
11. keep `LIFE_OS_PRIVATE_API_ENABLED=false` until the hosted application role and Supabase verifier are configured;
12. keep production private activation disabled under V1.

Railway provides Git/deployment metadata such as commit SHA and deployment ID to GitHub-triggered deployments. Life OS projects a small allow-listed subset through `RuntimeProvenance`; it never serializes `process.env` wholesale.

## Runtime provenance

The safe technical contract remains:

```text
RuntimeProvenance
- environment
- releaseSha
- deploymentId?   // technical only
- serviceName?    // technical only
- platform
```

Resolution priority for release SHA:

1. explicit `LIFE_OS_RELEASE_SHA`
2. Railway Git commit SHA
3. CI GitHub SHA
4. `local-unversioned` only for local development

A hosted development/production process without a release identity fails closed rather than producing untraceable behavior.

Runtime provenance is technical telemetry context, not a Life Timeline event.

## Health vs readiness

### Liveness

"Is this process alive and able to answer HTTP?"

- process-only;
- public;
- does not depend on external AI availability;
- does not expose deployment metadata.

### Readiness

"Is this deployment configured to serve Life OS requests safely?"

Health-only mode may use a minimal database probe.

Private-runtime mode verifies:

- current role is not superuser;
- current role cannot bypass RLS;
- all required private tables exist;
- all required private tables have enabled + forced RLS;
- current role does not own those tables;
- no user context is pre-bound;
- an unscoped Capture read sees zero rows.

Readiness never uses a real user's identity, returns row data, or mutates canonical life state.

## Migration deployment sequence

For a new hosted development database:

```text
create development project
      ↓
obtain migration/admin connection securely
      ↓
apply migrations 0001 → current
      ↓
provision least-privileged API role / grants
      ↓
prove ENABLE + FORCE RLS policies
      ↓
connect Railway API with application credential
      ↓
configure Supabase Auth verifier
      ↓
keep private flag false and check health
      ↓
set private flag true
      ↓
strict readiness must pass before API listens
      ↓
run synthetic Capture → Review → Trace smoke
      ↓
only then consider consented personal development data
```

Migrations do not run as part of ordinary API startup. Schema changes remain deliberate deployment operations using separate credentials.

## Interaction & Change Ledger / DevOps loop

Hosted development enables the requested loop:

```text
release SHA / deployment ID       technical telemetry
              ↓
synthetic or consented interaction trace
              ↓
Life OS interpretation / proposal
              ↓
approval or rejection
              ↓
canonical result (if any)
              ↓
rendered product behavior
              ↓
user/developer feedback
              ↓
new code + tests + deployment
              ↓
compare behavior by release
```

The link is correlation + release metadata, not copying private life content into deployment logs.

## Repository privacy gate

The repository has previously been public. Before introducing real service credentials or personal Life OS data, confirm the repository/privacy boundary deliberately.

Regardless of repository visibility:

- no credential goes into Git;
- no real production data goes into fixtures;
- no `.env` with secrets is committed;
- hosted variables live in the platform secret/variable system;
- logs/telemetry minimize private text.

## What the repository now provides

- safe `RuntimeProvenance` contract and resolver;
- long-running Node API transport;
- liveness/readiness routes;
- real Supabase session verifier;
- explicit private-runtime activation gate;
- combined private API router;
- least-privileged PostgreSQL repositories/RLS scope;
- strict application-role/RLS readiness;
- Safe Fallback Capture without AI dependency;
- sanitized technical telemetry;
- synthetic unit, behavior, visual and PostgreSQL integration gates.

## What remains deliberately external or later

- Supabase hosted development project;
- Railway hosted development service;
- real hosted credentials;
- hosted migration/application-role provisioning;
- real browser sign-in/session acquisition;
- browser private API wiring;
- CORS/origin policy for an actual split-origin topology;
- CSRF policy if cookie-based authentication is introduced;
- production Life OS AI;
- production private API activation;
- real production data.
