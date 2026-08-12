# database

PostgreSQL/Supabase persistence adapters, migrations, repositories, and transaction boundaries. Canonical-state mutations and meaningful domain events must remain transactionally consistent.

Current V1 persistence proof:

- `migrations/0001_write_boundary.sql` — canonical Calendar/event/applied-proposal schema
- `migrations/0002_capture_routing_proposal.sql` — original Capture + structured proposal provenance/state
- `migrations/0003_proposal_creation_provenance.sql` — request-idempotent Capture receipt time, persisted interpretation provenance, and general routing-proposal metadata/ownership
- `postgres-write-unit-of-work.ts` — PostgreSQL implementation of the shared transaction port, including Capture/proposal creation and locked proposal loading
- `in-memory-write-unit-of-work.ts` — deterministic multi-phase unit-test adapter

Capture persistence is intentionally split around interpretation: raw user text commits first; interpretation + its proposal set commit atomically afterward. Interpreter/network failure therefore cannot erase the original Capture, and proposal persistence failure cannot leave a partial interpretation bundle.

Apply operates from a persisted proposal owned by the authenticated user; client-submitted Apply requests do not redefine Calendar mutation details.

The PostgreSQL integration suite runs only against disposable CI data. Production credentials and personal data do not belong in this package or repository.
