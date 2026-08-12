# Life OS — Development Deployment V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Classification:** ALIGNED + EXTENSION  
**Status:** repository preparation only — no external resources or secrets created

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

## Current stop condition

**Do not create or claim a live Railway API deployment yet.**

The repository's API package currently contains application services and tests but no long-running HTTP server that:

- listens on the platform-provided `PORT`;
- exposes a health/readiness route;
- verifies a real authentication session;
- composes the PostgreSQL adapters from environment configuration;
- exposes deliberately reviewed HTTP routes.

Those are prerequisites, not configuration details to fake later.

## Environment ladder

### Local

- fake/sample web state
- in-memory and local/disposable PostgreSQL tests
- no production personal data required
- release may be `local-unversioned`

### CI

- disposable PostgreSQL service
- synthetic fixtures only
- migrations tested from zero
- security/RLS tests run with non-owner roles
- release identity comes from CI commit SHA

### Hosted development — future

- dedicated Supabase development project
- dedicated Railway development environment/service
- synthetic/non-sensitive data first
- separate development credentials
- migrations 0001 → current applied in order
- Railway backend uses a least-privileged application database credential
- deployment/release identity attached to technical telemetry

### Production — later

Production is a separate environment with separate project/service/credentials and is not created merely because development deployment works.

## Supabase PostgreSQL connection model

Supabase provides multiple Postgres connection modes. For a persistent backend service, prefer a direct Postgres connection when network reachability supports it. If the runtime network requires IPv4, Supavisor session mode is an appropriate persistent-client alternative.

Do not choose transaction-pooler mode casually for this backend. Life OS intentionally uses multi-statement SQL transactions and transaction-local `set_config('lifeos.user_id', ..., true)` RLS context. The selected connection mode must preserve one database session/transaction for the complete `PostgresUserScope.run(...)` callback.

The connection mode is therefore validated during the development-environment setup rather than hard-coded in source control.

## Two database credentials, two jobs

Future hosted development should separate schema administration from ordinary application traffic.

### Migration credential

`MIGRATION_DATABASE_URL` — server/CI/operator only.

Used only for:

- applying ordered migrations;
- creating/updating tables, functions, constraints, policies and app roles;
- controlled maintenance requiring schema-owner authority.

The running API must not use this credential for ordinary requests.

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

## Supabase keys

Supabase Auth may later require a browser-safe publishable/anon key. That does not grant the browser authority to bypass the Life OS application write model.

`SUPABASE_SERVICE_ROLE_KEY`, if ever required for a narrowly defined server-side administrative integration, remains server-only and must not become the ordinary private-data access path because it is elevated access.

The current private application model is backend API → least-privileged PostgreSQL role → RLS.

## Railway service requirements

When the API becomes deployable, the service must:

1. build from the shared npm monorepo without copying secrets into the image;
2. start one long-running API process;
3. listen on Railway's injected `PORT`;
4. expose a lightweight liveness endpoint;
5. expose readiness that verifies required configuration without returning secrets;
6. fail startup for missing production/development-required configuration;
7. receive `DATABASE_URL` and other secrets only through Railway variables;
8. never return environment-variable dumps through debug routes;
9. carry release/deployment provenance into technical telemetry;
10. keep user-facing Interaction & Change Ledger data separate from technical logs.

Railway provides Git/deployment metadata such as commit SHA and deployment ID to GitHub-triggered deployments. Life OS projects a small allow-listed subset through `RuntimeProvenance`; it never serializes `process.env` wholesale.

## Runtime provenance

The safe technical contract is:

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

Runtime provenance is **technical telemetry context**, not a Life Timeline event.

## Health vs readiness

The future API should distinguish:

### Liveness

"Is this process alive and able to answer HTTP?"

Must not depend on external AI availability.

### Readiness

"Is this deployment configured to serve Life OS requests safely?"

May validate required configuration and a minimal database check under appropriate server/system semantics. It must not use a real user's identity, expose row data, or mutate canonical life state.

Railway deployment healthchecks should target the route we deliberately choose for deployment activation. Continuous production monitoring is a separate operational concern; a deployment healthcheck alone is not our observability system.

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
run synthetic smoke flow
      ↓
Capture → proposal → review → approve/reject → ledger
      ↓
only then consider real personal test data
```

Migrations must not silently run as part of every normal API startup. Schema changes are deliberate deployment operations with separate credentials and observable outcomes.

## Interaction & Change Ledger / DevOps loop

Hosted development enables the loop requested for Life OS development:

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

The link is **correlation + release metadata**, not copying private life content into deployment logs.

## Repository privacy gate

The repository has previously been public. Before introducing real service credentials or personal Life OS data, confirm the repository/privacy boundary deliberately.

Regardless of repository visibility:

- no credential goes into Git;
- no real production data goes into fixtures;
- no `.env` with secrets is committed;
- hosted variables live in the platform secret/variable system;
- logs/telemetry minimize private text.

## What this V1 preparation adds now

- safe `RuntimeProvenance` contract;
- allow-listed runtime provenance resolver;
- secret-leak regression tests;
- explicit `LIFE_OS_ENVIRONMENT` and optional release override in `.env.example`;
- deployment architecture and prerequisite checklist.

## What it deliberately does not add

- Supabase project
- Railway project/service
- paid resource
- database/user/password
- production secret
- HTTP server
- health endpoint
- Supabase Auth adapter
- live browser persistence
- technical telemetry storage
- production Life OS AI

The next executable deployment prerequisite is the minimal API transport/liveness/readiness layer. It should be built and tested before any external Railway service is created.
