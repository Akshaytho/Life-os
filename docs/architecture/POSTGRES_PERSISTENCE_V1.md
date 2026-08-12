# Life OS — PostgreSQL Persistence Boundary V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Change classification:** EXTENSION  
**Status:** integration proof for canonical write persistence

## Product question

Can the Proposal → Confirm → Commit invariant survive a real database transaction, constraints and retries without introducing production credentials or personal data?

## Scope

This slice implements the existing `WriteUnitOfWork` contract with `node-postgres` and proves it against an ephemeral PostgreSQL database in CI.

It does not add a production Supabase connection, authentication, real user data, AI access, or a live mutation UI.

## Schema

Migration `0001_write_boundary.sql` creates the minimum canonical persistence required by the first write path:

- `calendar_event` — canonical Calendar state
- `domain_event` — append-only meaningful domain history
- `applied_proposal` — idempotency / applied-proposal receipt

The schema uses constraints to reject invalid categories, commitments, time ranges, actor classes, sources, invalid fingerprints and broken event references.

Identifiers are stored as non-empty opaque text values at this boundary. This deliberately avoids freezing a hidden UUID/provider rule before identity and ID generation are finalized. A future Supabase-auth user ID may still be a UUID string without forcing every Life OS entity/actor identifier to use the same provider-specific representation.

`source_proposal_id` is unique on Calendar rows and `proposal_id` is the primary key of `applied_proposal`. A production adapter can use those constraints to protect against concurrent duplicate submissions as well as application-level replay checks.

## Transaction adapter

`PostgresWriteUnitOfWork`:

1. obtains one pooled database client
2. begins a SQL transaction
3. exposes the existing `WriteTransaction` operations through parameterized SQL
4. commits only when the application service completes
5. rolls back on any error
6. releases the client, discarding it if rollback itself fails

No domain rule moves into SQL merely because persistence exists. The application service remains responsible for authority/revalidation semantics; database constraints are a second integrity layer.

## Integration proof

CI starts an ephemeral PostgreSQL 18 container with fake credentials and a disposable database.

The integration suite:

- applies a confirmed Calendar proposal through the real application service and PostgreSQL adapter
- uses deliberately non-UUID fixture identifiers to prove the persistence port remains provider-neutral
- verifies exactly one canonical row, one domain event and one applied-proposal marker
- verifies USER actor and correlation/proposal provenance
- verifies raw Capture text is not duplicated into the domain-event payload
- verifies exact replay remains idempotent
- deliberately violates a database event constraint after staging a Calendar row and proves the entire SQL transaction rolls back

The existing in-memory unit tests remain because they test application semantics quickly; PostgreSQL tests prove the adapter and schema honor the same contract.

## Privacy / environment boundary

The CI database uses only fake opaque IDs, fixture text and local service-container credentials. No external database is contacted.

Production Supabase credentials must not be introduced until repository privacy, authentication, authorization, environment separation and secret handling are deliberately ready.

## Pre-build canonical comparison

- **ALIGNED:** PostgreSQL is canonical structured truth.
- **ALIGNED:** canonical mutation + domain event stay transactional.
- **ALIGNED:** provenance and authority remain unchanged by the persistence technology.
- **ALIGNED:** AI receives no database authority.
- **ALIGNED:** fake development/test data only.
- **REFINEMENT:** persistence does not silently dictate a provider-specific identifier format.
- **EXTENSION:** adds the first PostgreSQL adapter, schema and CI integration proof.
- **NO CONFLICT:** no product ownership, AI role, trust rule or navigation responsibility changes.
