# Private API Composition V1

## Canonical comparison

Canonical artifact reviewed: `LIFE-OS-CANON-001` v1.2.0.

Classification: **ALIGNED + COMPOSITION**.

This slice does not add a new domain operation. It combines already-reviewed private HTTP handlers behind one routing surface while preserving every existing trust boundary.

## Routes owned by the composition

- `POST /api/v1/captures` → Private Capture POST
- `GET /api/v1/captures/:captureId/review` → Proposal Review read
- `GET /api/v1/interactions/:captureId/trace` → Interaction & Change trace read
- `POST /api/v1/proposals/:proposalId/apply` → explicit Calendar proposal Apply
- `POST /api/v1/proposals/:proposalId/reject` → terminal proposal Reject

Unknown routes return the same private no-store `404 not_found` envelope.

## Composition responsibility

The router decides only **which already-reviewed handler receives the request**.

It does not reimplement or override:

- Bearer session verification
- trusted user/source/time/request metadata
- Capture retry idempotency
- body/media limits
- proposal ownership
- Apply/Reject eligibility
- explicit confirmation
- RLS scope
- database transactions
- domain-event atomicity
- proposal terminal-state idempotency
- telemetry privacy
- HTTP error sanitization

Each delegated handler remains authoritative for its own route contract.

## End-to-end proof

The integration proof uses one PostgreSQL database and the real production-shaped dependencies:

- `PostgresWriteUnitOfWork`
- `PostgresProposalReviewReader`
- `PostgresInteractionChangeLedgerReader`
- non-superuser / `NOBYPASSRLS` application role
- synthetic `SessionVerifier`
- synthetic interpreter/data only

Two complete flows must work through the combined server:

### Committed flow

1. authenticated Capture POST
2. Proposal Review GET
3. explicit Apply POST
4. Interaction Trace GET
5. exactly one Calendar canonical row + one domain event
6. trace reports committed change/provenance

### No-write flow

1. authenticated Capture POST
2. Proposal Review GET
3. Reject POST
4. Interaction Trace GET
5. zero additional Calendar/domain-event writes
6. trace reports closed/no-change rejection provenance

The proof also checks cross-user reads/actions, unknown routes, unscoped RLS reads, and privacy-safe telemetry.

## Deployment boundary

This composition is still **not wired into `apps/api/src/main.ts`**.

V1 intentionally does not add:

- production Supabase session verification
- hosted environment credentials
- Railway/Supabase resource creation
- browser mutation wiring
- high-authority direction approval
- admin/service-role database access

The running API remains health-only until production authentication and hosted deployment composition are explicitly introduced and validated.