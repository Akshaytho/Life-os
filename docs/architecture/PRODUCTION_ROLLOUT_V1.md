# Life OS — Production Rollout V1

## Purpose

Promote the reviewed Life OS feature stack into a phone-facing production service while
preserving user isolation, reversible capability activation, and exact release provenance.

## Release approval

Production API, migration, and role-provisioning commands require:

`LIFE_OS_PRODUCTION_RELEASE_SHA=<exact reviewed 40-character commit SHA>`

The value must equal the deployed runtime release. Railway's deployment-scoped
`RAILWAY_GIT_COMMIT_SHA` remains the authoritative runtime identity. Approval is deliberately
release-specific so a future commit cannot inherit permission from an earlier deployment.

## Database boundary

Before a production API process can listen, readiness must prove:

- every shipped personal table exists with RLS and FORCE RLS;
- `anon`, `authenticated`, `service_role`, and `PUBLIC` have no direct table authority;
- the NOBYPASSRLS application role can execute the hardened user-scope function;
- the user-scope function is SECURITY INVOKER with an empty fixed search path;
- the migration owner's defaults cannot auto-grant future tables, sequences, or functions;
- the ordinary application role still passes every enabled capability's narrow grant check;
- an unscoped application connection sees zero personal rows;
- hosted PostgreSQL transport uses `verify-full` with the reviewed provider CA.

Migration `0014_production_security_hardening.sql` establishes the provider-role revocations,
fixed function search paths, private default privileges, and missing foreign-key indexes.

## Deployment order

1. Deploy production API and web services with every optional feature flag false.
2. Apply all migrations through `0014` using the separate migration credential.
3. Apply the baseline application-role plan and verify READY.
4. Configure exact API/web HTTPS origins and exact CORS; never use a wildcard.
5. Verify sign-in, Capture, Review, Trace, Reject/Apply, Calendar, Today, and sign-out.
6. Activate Direction and its narrow grants; verify its zero-write preflight and UI.
7. Activate Daily Return and its grants; perform the complete morning/evening workflow.
8. Activate Brain Dump + NOT NOW, Drift + Return, and Journey Practice one at a time.
9. Activate read-only Ask retrieval only after its source capabilities remain healthy.
10. Activate Weekly/Monthly Reviews, Memory, Memory-aware Ask, and composed Today in order.

At every step require liveness, readiness, authentication, two-user isolation, UI persistence,
idempotency, provenance, and sign-out checks before enabling the next capability.

## Dogfood identity and data

Use dedicated production dogfood users with realistic fictional data. Do not use real personal
details during rollout. Prefix test requests with stable dogfood identifiers so they are easy to
audit and archive without weakening normal product behavior.

The 60-day dogfood run exercises the same authenticated browser surfaces as an ordinary user.
It records actual application state; it does not bypass APIs or insert rows directly.

## Rollback

Feature rollback is flag-first: turn off the browser flag when present, then the matching API
flag. Retain append-only/superseded history. Do not delete user rows to roll back code.

If baseline production readiness fails, stop or roll back the API service. Keep migrations and
data intact, restore the last approved release SHA, and re-run readiness before accepting traffic.
