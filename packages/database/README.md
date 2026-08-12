# database

PostgreSQL/Supabase persistence adapters, migrations, repositories, and transaction boundaries. Canonical-state mutations and meaningful domain events must remain transactionally consistent.

Current V1 persistence proof:

- `migrations/0001_write_boundary.sql` — canonical Calendar/event/applied-proposal schema
- `migrations/0002_capture_routing_proposal.sql` — original Capture + structured proposal provenance/state
- `postgres-write-unit-of-work.ts` — PostgreSQL implementation of the shared transaction port, including locked proposal loading
- `in-memory-write-unit-of-work.ts` — deterministic unit-test adapter

Apply operates from a persisted proposal owned by the authenticated user; client-submitted Apply requests do not redefine Calendar mutation details.

The PostgreSQL integration suite runs only against disposable CI data. Production credentials and personal data do not belong in this package or repository.
