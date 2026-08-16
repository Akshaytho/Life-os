# Life OS — Migration Ledger Security V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `HOSTED_DEVELOPMENT_MIGRATIONS_V1.md`, `HOSTED_DEVELOPMENT_APPLICATION_ROLE_V1.md`  
**Classification:** ALIGNED + REFINEMENT  
**Status:** reviewed repository boundary for the technical migration ledger

## Goal

Keep `lifeos_schema_migration` as admin-only deployment metadata even when a managed PostgreSQL provider automatically grants new `public` schema tables to API-facing roles.

The ledger is not Life OS user data, a canonical domain table, or a browser API surface. It exists only so the migration/admin workflow can prove ordered filenames and checksums.

## Hosted finding that triggered this refinement

The hosted Supabase development project correctly denied `lifeos_app` access to the migration ledger, but the provider-created API roles `anon`, `authenticated`, and `service_role` still held direct table privileges because the ledger was created in `public` without an explicit post-create hardening step.

RLS was also disabled on the ledger. That combination meant the technical migration history could become reachable through an API-facing database role even though the private Life OS application role itself remained least-privileged.

This was treated as a hosted-baseline blocker rather than accepted as provider default behavior.

## Exact ledger contract

Whenever `migrate:apply` ensures `lifeos_schema_migration`, the runner must also ensure:

- ordinary PostgreSQL RLS is enabled;
- FORCE RLS is not enabled;
- no RLS policies are created;
- `PUBLIC` has no table privileges;
- if `anon` exists, it has no table privileges;
- if `authenticated` exists, it has no table privileges;
- if `service_role` exists, it has no table privileges.

`lifeos_app` remains separately required to have no migration-ledger access by application-role provisioning and runtime readiness.

## Why RLS is enabled but not forced

The migration ledger is maintained only by the migration/admin credential. Ordinary RLS provides defense in depth against a future accidental grant to a non-owner role because there are no policies that would expose rows.

FORCE RLS is deliberately not enabled because the ledger owner/admin must still be able to read and append migration history without introducing a policy that turns technical deployment metadata into an application authorization surface.

On managed PostgreSQL providers an administrative role may also carry `BYPASSRLS`; that is why RLS is not the only control. Direct table privileges are revoked from every reviewed API-facing role as the primary boundary.

## Why this belongs to the runner instead of a one-off hosted patch

`lifeos_schema_migration` is created by the migration runner itself rather than by an ordinary numbered domain migration. Its protection therefore belongs to the same runner-owned ensure step.

This gives two properties:

1. a new environment is hardened immediately when the ledger is created;
2. an existing environment can repair ledger grant/RLS drift by re-running `migrate:apply` even when there are zero pending numbered migrations.

Plan mode remains read-only and does not repair drift.

## Provider-role handling

Local and CI PostgreSQL installations do not necessarily define Supabase roles. The runner therefore discovers only the exact reviewed role names that actually exist and asks PostgreSQL to quote those identifiers before revoking privileges.

It does not create provider roles and does not broaden the deny-list dynamically from arbitrary database contents.

## Security non-goals

This refinement does not:

- expose migration history through Supabase Data API;
- add user-facing RLS policies to the ledger;
- grant `service_role` to Life OS runtime;
- change any canonical table RLS policy;
- change migration checksums or history rows;
- create a new numbered domain migration;
- enable Direction;
- enable the AI interpreter;
- introduce personal data.

## Regression proof

`migration-ledger-security.integration.ts` uses a disposable PostgreSQL schema to prove:

1. normal migration apply creates all reviewed migration history;
2. the ledger ends with RLS enabled, FORCE RLS off, no policies, and no ACL entries for `PUBLIC`, `anon`, `authenticated`, or `service_role`;
3. deliberate drift can disable RLS and grant the ledger back to those API-facing roles;
4. migration plan still reports zero pending and remains read-only;
5. a second zero-pending `migrate:apply` repairs the ledger security boundary without rewriting migration history.
