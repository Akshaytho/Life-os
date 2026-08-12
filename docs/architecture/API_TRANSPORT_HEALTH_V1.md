# Life OS — API Transport / Health V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `DEVELOPMENT_DEPLOYMENT_V1.md`  
**Classification:** ALIGNED + EXTENSION

## Purpose

Make the Life OS API process deployable enough for infrastructure validation **without exposing private Life OS application routes before real authentication and transport authorization exist**.

V1 is intentionally health-only.

## Public HTTP surface

```text
GET|HEAD /health/live
GET|HEAD /health/ready
```

Everything else returns 404. Mutation methods return 405.

There is deliberately no `/capture`, `/calendar`, `/proposal`, `/memory`, `/mcp`, debug-env or generic database endpoint in this transport slice.

## Liveness

`/health/live` answers only whether the HTTP process is alive.

It:

- does not call PostgreSQL;
- does not depend on Life OS AI;
- does not require a user identity;
- does not expose release/deployment/database details;
- returns only `{ "status": "ok" }`.

This keeps infrastructure liveness independent from external dependencies.

## Readiness

`/health/ready` answers whether the deployment is currently ready for its configured runtime.

In hosted `development` / `production` environments:

- runtime release identity is required;
- `DATABASE_URL` is required;
- readiness performs only a constant `SELECT 1` database connectivity probe;
- provider/database errors are sanitized from the public HTTP response;
- failure returns `503 { "status": "not_ready" }`.

Local health-only development may start without PostgreSQL and returns ready so developers can validate the transport itself.

When private routes are introduced later, readiness may grow only through deliberate checks that do not use a real user's identity or mutate canonical state.

## Runtime / Railway compatibility

The API:

- listens on `0.0.0.0`;
- reads platform `PORT`, defaulting to 4000 locally;
- rejects invalid ports before startup;
- exposes root command `npm run start:api`;
- uses the existing npm shared monorepo rather than introducing another build system;
- receives database/release configuration only through environment variables;
- never serializes `process.env` wholesale.

For this first development transport, `tsx` is an explicit runtime dependency of the API workspace so TypeScript can execute directly. A later production-hardening slice may replace this with compiled/bundled JavaScript without changing route or trust semantics.

## Technical startup/shutdown logs

The process emits a small allow-listed technical message for:

- API started;
- API shutdown signal;
- startup/server failure class.

Allowed startup metadata is limited to items such as environment, release SHA, platform and service name.

It does **not** log:

- `DATABASE_URL`;
- Supabase/OpenAI credentials;
- raw Capture text;
- proposal payloads;
- user/session identity;
- arbitrary environment variables.

These messages are developer telemetry, not Interaction & Change Ledger entries.

## Graceful shutdown

SIGTERM/SIGINT stop accepting HTTP work, close the server and close the PostgreSQL pool. This matters for hosted deployment replacement so database connections are not intentionally abandoned.

## Security boundary

Passing a healthcheck does not mean private Life OS routes are authorized.

The next private HTTP route must still:

1. extract only the expected opaque session credential;
2. pass it through the trusted `SessionVerifier` boundary;
3. build trusted request context on the server;
4. bind authenticated PostgreSQL RLS scope;
5. call the existing application service;
6. sanitize errors;
7. preserve Interaction & Change Ledger provenance;
8. never accept client-supplied user/source/time authority.

No private route should be added merely because Railway can reach the service.

## Tests

The transport unit tests prove:

- liveness never calls readiness/database;
- readiness success returns only `ready`;
- provider/database failure returns only `not_ready` with no leaked error/URL;
- public health bodies omit release/deployment metadata;
- unknown routes remain 404;
- POST to a health route remains 405;
- hosted environments require database config;
- non-local runtime release identity is already enforced by `RuntimeProvenance`;
- database readiness issues only `SELECT 1`.

## Not introduced

- external Railway service
- Supabase project
- private API route
- real authentication adapter
- CORS/session policy
- live Capture/Review/Apply
- production AI
- technical telemetry storage
- user-visible Ledger screen
- real personal data

This slice exists only to make the future hosted API process observable enough to deploy safely before private functionality is exposed.
