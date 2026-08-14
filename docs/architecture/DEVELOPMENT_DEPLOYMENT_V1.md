# Life OS — Development Deployment V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Classification:** ALIGNED + EXTENSION  
**Status:** repository deployment/runtime tooling implemented — no external hosted resources or real secrets created

## Goal

Prepare a trustworthy hosted **development** environment without turning deployment convenience into a new authority/security model.

The intended topology remains:

```text
Life OS Web
     ↓ HTTPS
Railway Life OS API
     ↓ server-only application database credential
Supabase PostgreSQL + Supabase Auth
```

Private domain writes still go through authenticated request context, per-user PostgreSQL RLS, proposal/approval policy, application services, and transactional domain events.

## Current repository checkpoint

The repository now provides the executable prerequisites for hosted development:

- one long-running Node HTTP server on platform `PORT`;
- public liveness/readiness routes;
- reviewed private Capture/read/proposal-action routes;
- real Supabase user-session verification;
- Safe Fallback Capture when semantic AI is unavailable;
- explicit private-runtime activation, disabled by default;
- production private-runtime refusal in V1;
- PostgreSQL repositories with transaction-local Life OS user scope;
- strict runtime verification of the exact least-privilege application role;
- plan-first, checksummed migrations with atomic history;
- plan-first application-role provisioning after migrations;
- synthetic PostgreSQL integration coverage for migrations, provisioning, RLS, and the composed runtime;
- sanitized technical telemetry and release provenance.

See:

- `PRIVATE_API_COMPOSITION_V1.md`
- `SUPABASE_SESSION_VERIFIER_V1.md`
- `SAFE_FALLBACK_CAPTURE_V1.md`
- `PRIVATE_RUNTIME_COMPOSITION_V1.md`
- `HOSTED_DEVELOPMENT_MIGRATIONS_V1.md`
- `HOSTED_DEVELOPMENT_APPLICATION_ROLE_V1.md`

## Current external stop condition

**Do not claim a live Railway/Supabase development deployment yet.**

Repository tooling does not create accounts, projects, paid resources, real credentials, or a browser session.

A real hosted-development activation still requires an operator to:

1. create a dedicated Supabase development project;
2. create a dedicated Railway development service/environment;
3. obtain/store development-only migration credentials outside Git;
4. run the migration plan and explicit apply command against the clean development database;
5. generate a strong application-role password in a secret manager/local secure environment;
6. run the application-role plan and explicit apply command;
7. build the server-only `DATABASE_URL` for that role using the exact Supabase **Connect** details;
8. configure Supabase Auth and obtain the browser-safe publishable/legacy anon project key;
9. set Railway release/database/Supabase variables while leaving the private flag false;
10. deploy health-only and verify liveness;
11. set `LIFE_OS_PRIVATE_API_ENABLED=true` only when strict readiness can pass;
12. run a synthetic Capture → Review → Trace smoke flow before personal data;
13. review browser origin/session/CORS/CSRF policy separately before browser mutations are enabled.

## Environment ladder

### Local

- fake/sample web state may remain available;
- local/disposable PostgreSQL tests;
- health-only API works without a database;
- private API requires the reviewed auth/database prerequisites;
- no production personal data required.

### CI

- disposable PostgreSQL service;
- synthetic fixtures only;
- migrations tested from zero;
- application-role provisioning tested with a disposable global login;
- RLS tests run with non-owner, non-bypass roles;
- release identity comes from CI commit SHA.

### Hosted development — next external stage

- dedicated Supabase development project;
- dedicated Railway development service/environment;
- synthetic/non-sensitive data first;
- separate migration and application database credentials;
- migrations applied in order through the reviewed runner;
- application role provisioned through the reviewed least-privilege helper;
- private runtime activated only after strict readiness;
- deployment/release identity attached to technical telemetry.

### Production — later

Production remains a separate environment with separate project/service/credentials and separate approval.

Current V1 private-runtime, migration, and application-role tools all refuse production where applicable.

## Supabase PostgreSQL connection model

For a persistent backend service, prefer a direct Postgres connection when network reachability supports it. If the runtime requires IPv4, Supavisor **session mode** is the persistent-client alternative.

Do not select transaction-pooler mode casually for Life OS. The backend intentionally uses multi-statement transactions and transaction-local `set_config('lifeos.user_id', ..., true)` RLS context. One `PostgresUserScope.run(...)` callback must remain on one database transaction/session.

For hosted setup, use the exact connection strings/hostnames/usernames shown by the Supabase **Connect** panel instead of constructing project-qualified pooler details in source code.

## Two database credentials, two jobs

### Migration credential

`MIGRATION_DATABASE_URL` — admin/operator/CI only.

Used for:

- ordered migration planning/apply;
- migration checksum/history ownership;
- dedicated application-role provisioning;
- controlled schema administration.

The running private API does not consume this credential.

### Application credential

`DATABASE_URL` — Railway API only.

It must authenticate as the dedicated Life OS application role with this exact shape:

```text
LOGIN
NOSUPERUSER
NOCREATEDB
NOCREATEROLE
NOINHERIT
NOREPLICATION
NOBYPASSRLS
zero role memberships
schema USAGE, no CREATE
SELECT/INSERT/UPDATE/DELETE on seven private runtime tables
no TRUNCATE/REFERENCES/TRIGGER
no migration-ledger access
non-owner of private tables
```

Every private transaction still binds the authenticated Life OS user into transaction-local `lifeos.user_id` before repositories execute SQL.

## Plan-first deployment commands

Migration inspection:

```bash
npm run migrate --workspace @life-os/api
```

Explicit migration apply:

```bash
npm run migrate:apply --workspace @life-os/api
```

Application-role inspection:

```bash
npm run db-role --workspace @life-os/api
```

Explicit role create/rotation + direct-grant repair:

```bash
npm run db-role:apply --workspace @life-os/api
```

The default commands are inspection-only. Schema or role changes require the explicit apply variants.

The application-role password is admin-tool input only and is never intentionally printed by the CLI.

## Runtime readiness

Health-only mode may use a minimal database probe.

Private-runtime mode independently verifies the connected application credential rather than trusting the provisioning command's receipt.

Readiness requires:

- no superuser / bypass-RLS / create-database / create-role / replication authority;
- `NOINHERIT` and zero role memberships;
- schema `USAGE` but no `CREATE`;
- all seven private tables present;
- all seven with enabled + forced RLS;
- application role owns none of those tables;
- exact CRUD grants without `TRUNCATE/REFERENCES/TRIGGER`;
- no user context pre-bound;
- zero visible Capture rows without user context;
- no migration-ledger table authority.

Initial private readiness must pass before the long-running API listens.

Readiness does not use a real user's identity, return row data, or mutate canonical life state.

## Supabase Auth keys

Supabase Auth verification uses a browser-safe publishable key, with legacy anon-key fallback where necessary.

That project key identifies the Supabase project to Auth; it does not grant Life OS database bypass authority.

`SUPABASE_SERVICE_ROLE_KEY` is not consumed by ordinary private-runtime or application-role provisioning paths and must not become a shortcut around the Life OS write/RLS model.

## Hosted-development activation sequence

```text
create clean Supabase development project
      ↓
store migration/admin connection securely
      ↓
npm run migrate      # inspect
      ↓
npm run migrate:apply
      ↓
generate/store application-role password securely
      ↓
npm run db-role      # inspect
      ↓
npm run db-role:apply
      ↓
construct server-only application DATABASE_URL from Supabase Connect details
      ↓
configure Supabase Auth verifier values
      ↓
configure Railway development service with private flag false
      ↓
deploy + verify /health/live
      ↓
enable private flag
      ↓
strict /health/ready must pass
      ↓
run synthetic authenticated Capture → Review → Trace smoke
      ↓
only then consider consented personal development data
```

Migrations and role provisioning never run automatically during API startup.

## Railway service requirements

The hosted development service must:

1. build from the shared npm monorepo without copying secrets into the image;
2. start one long-running API process;
3. listen on Railway's injected `PORT`;
4. expose lightweight `/health/live`;
5. expose strict `/health/ready` when private runtime is enabled;
6. fail startup for missing/unsafe hosted configuration;
7. receive server-only secrets through platform variables;
8. never expose environment dumps through debug routes;
9. attach allow-listed release/deployment provenance to technical telemetry;
10. keep user-facing Interaction & Change Ledger data separate from technical logs;
11. keep private runtime disabled until the application credential and Supabase verifier are configured;
12. keep production private activation disabled under V1.

## Repository/privacy gate

The repository may be visible beyond the deployment operators. Regardless of repository visibility:

- no credential goes into Git;
- no real `.env` with secrets is committed;
- no real production/personal data goes into fixtures;
- hosted variables live in the platform secret/variable system;
- technical logs minimize private text.

Before personal Life OS development data is introduced, repository visibility and collaborator access should be reviewed deliberately.

## What remains external or later

- Supabase hosted development project;
- Railway hosted development service;
- real hosted credentials/secrets;
- actual hosted migration/app-role execution;
- browser sign-in/session acquisition;
- browser private API wiring;
- concrete CORS/origin policy for the chosen topology;
- CSRF policy if cookie authentication is introduced;
- production Life OS AI;
- production private API/migration provisioning;
- real production data.
