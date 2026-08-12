# database

PostgreSQL/Supabase persistence adapters, migrations, repositories, transaction boundaries, and trusted read projections. Canonical-state mutations and meaningful domain events must remain transactionally consistent.

Current V1 persistence proof:

- `migrations/0001_write_boundary.sql` — canonical Calendar/event/applied-proposal schema
- `migrations/0002_capture_routing_proposal.sql` — original Capture + structured proposal provenance/state
- `migrations/0003_proposal_creation_provenance.sql` — request-idempotent Capture receipt time, persisted interpretation provenance, and general routing-proposal metadata/ownership
- `postgres-write-unit-of-work.ts` — PostgreSQL implementation of the shared transaction port, including Capture/proposal creation and locked proposal loading
- `postgres-proposal-review-reader.ts` — owner-scoped read-only projection source for Capture → interpretation → proposal review
- `in-memory-write-unit-of-work.ts` — deterministic multi-phase unit-test adapter

Capture persistence is intentionally split around interpretation: raw user text commits first; interpretation + its proposal set commit atomically afterward. Interpreter/network failure therefore cannot erase the original Capture, and proposal persistence failure cannot leave a partial interpretation bundle.

Apply operates from a persisted proposal owned by the authenticated user; client-submitted Apply requests do not redefine Calendar mutation details.

The proposal review reader is also ownership-scoped by authenticated user + Capture ID. It uses one PostgreSQL statement so the source, interpretation, and proposal rows come from one statement snapshot. It does not expose arbitrary `payload_json` directly as a UI contract; the API projection deliberately maps only review-safe domain fields.

The PostgreSQL integration suites run only against disposable CI data. The review-reader suite uses its own temporary schema so it cannot interfere with transaction-boundary tests running in parallel. Production credentials and personal data do not belong in this package or repository.
