# Life OS — Hosted Development Migrations V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `DEVELOPMENT_DEPLOYMENT_V1.md`, `PRIVATE_RUNTIME_COMPOSITION_V1.md`  
**Classification:** ALIGNED + IMPLEMENTATION  
**Status:** repository migration tooling implemented; no hosted database has been changed by this artifact

## Goal

Provide one deliberate, auditable way to apply the ordered Life OS PostgreSQL migrations to a **clean local/CI/hosted-development database** using the separate migration/admin credential.

This tool is not part of ordinary API startup and does not use the application `DATABASE_URL` for schema administration.

## Commands

From the repository:

```bash
npm run migrate --workspace @life-os/api
```

This is **plan-only**. It connects with `MIGRATION_DATABASE_URL`, reads migration history and reports:

- already-applied filenames;
- pending filenames.

It does not create the migration ledger or apply schema changes.

To apply the pending plan deliberately:

```bash
npm run migrate:apply --workspace @life-os/api
```

`migrate:apply` is the only repository command in V1 that applies the migration files.

## Environment boundary

Required:

- `MIGRATION_DATABASE_URL`

Runtime provenance still applies. Hosted development should also set:

- `LIFE_OS_ENVIRONMENT=development`
- `LIFE_OS_RELEASE_SHA=<release>`

When `LIFE_OS_ENVIRONMENT=development` and `DATABASE_URL` is also present, V1 refuses the obvious unsafe case where `DATABASE_URL` and `MIGRATION_DATABASE_URL` are identical.

This check supplements—not replaces—the private runtime readiness boundary. The running private API still rejects superuser, `BYPASSRLS`, and table-owner application roles.

## Production stop condition

Hosted Development Migrations V1 refuses:

```text
LIFE_OS_ENVIRONMENT=production
```

There is no production override flag in V1.

Production schema migration requires a separate reviewed deployment policy rather than reusing development approval accidentally.

## Ordered migration set

Migration files live under:

```text
packages/database/migrations/
```

V1 requires filenames to follow:

```text
0001_name.sql
0002_name.sql
...
```

Sequences must:

- start at `0001`;
- be contiguous;
- contain no gaps;
- use lowercase/underscore names;
- be `.sql` files.

The current reviewed set is `0001` through `0006`.

## Runner-owned transaction

Existing migration files are written with one explicit outer transaction:

```sql
BEGIN;
-- migration body
COMMIT;
```

The runner validates this shape, strips only that outer wrapper, and then executes:

```text
BEGIN
  migration body
  insert checksum/history row
COMMIT
```

This makes the schema change and its migration-history record atomic.

A failed migration therefore cannot legitimately leave its history row marked applied. The integration suite also proves a table created earlier in a deliberately failing migration is rolled back.

Nested `BEGIN`, `COMMIT`, or `ROLLBACK` controls are rejected by V1 migration-set validation.

## Migration history

The runner owns one technical metadata table in the active migration schema:

```text
lifeos_schema_migration
- sequence
- filename
- checksum_sha256
- applied_at
```

Every applied SQL file is SHA-256 checksummed from its exact repository content.

On every plan/apply, the runner compares database history against the release's migration files in sequence order.

It fails closed on:

- filename mismatch;
- checksum mismatch;
- changed historical migration content;
- database history newer than the checked-out release;
- sequence gaps in the repository.

Applied migration SQL should therefore be treated as immutable. A new schema change belongs in a new migration number.

## Clean-database requirement

V1 does not retroactively certify an unknown existing Life OS schema.

When no tracked migration history exists, the runner checks for known Life OS private tables:

- `calendar_event`
- `domain_event`
- `applied_proposal`
- `capture_record`
- `routing_interpretation`
- `routing_proposal`
- `proposal_rejection`

If any are already present, both plan and apply fail with migration-history drift.

This means a hosted-development database should be created clean and then migrated through this runner. Existing manually managed databases need a separately reviewed adoption/reconciliation procedure if they are ever brought under migration history.

## Concurrency

Apply mode uses one PostgreSQL session and acquires a session-level advisory lock for the Life OS migration runner before reading/applying migration history.

This prevents two normal V1 runners from applying the same pending sequence concurrently.

The advisory lock is released in a `finally` path and also disappears automatically if the database session terminates.

## Secret/privacy boundary

The migration CLI never intentionally prints:

- `MIGRATION_DATABASE_URL`;
- `DATABASE_URL`;
- passwords;
- SQL/provider error bodies;
- personal Life OS data.

Success output is limited to safe environment classification and migration filenames.

Failure output is a generic status plus a safe migration-runner error code.

Migration metadata is technical deployment state, not a Life Timeline/domain event.

## PostgreSQL proof

`migration-runner.integration.ts` uses a disposable test schema and the CI PostgreSQL service to prove:

1. plan-only on a clean schema reports `0001`–`0006` pending;
2. plan-only creates no migration ledger;
3. apply executes all six migrations in order;
4. each history row stores a SHA-256 checksum;
5. all expected private tables exist afterward;
6. a second apply is idempotent and applies nothing;
7. final plan reports no pending migration;
8. tampered checksum history is rejected;
9. existing Life OS tables without history are rejected and not retroactively certified;
10. a deliberately failing migration rolls back both its schema change and history row.

## Deliberate non-goals

V1 does not:

- create a Supabase project;
- create a Railway service;
- provision the least-privileged application role/password;
- grant the application role its runtime privileges;
- store secrets in Git;
- modify a production database;
- run migrations automatically during API startup;
- migrate an unknown existing Life OS schema by assumption.

Application-role provisioning and external hosted-resource setup remain explicit later deployment steps.
