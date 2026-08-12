# Authorized PostgreSQL Adapters V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Classification:** ALIGNED + REFINEMENT

## Purpose

The PostgreSQL RLS primitive already proves that private rows are isolated when a trusted transaction-local `lifeos.user_id` is bound under a non-owner, non-superuser, non-`BYPASSRLS` application role.

This slice makes that protection part of the **normal application adapter shape**, rather than something a future endpoint must remember to opt into manually.

## Invariant

A private Life OS database transaction cannot be opened through `WriteUnitOfWork` without an authenticated user ID.

```text
trusted request context
       ↓
authenticated user ID
       ↓
WriteUnitOfWork.run(userId, ...)
       ↓
PostgresUserScope
  BEGIN
  set_config('lifeos.user_id', userId, true)
       ↓
private SQL under PostgreSQL RLS
       ↓
COMMIT / ROLLBACK
```

`PostgresProposalReviewReader` follows the same rule: its owner-scoped read executes inside `PostgresUserScope`, while the explicit `user_id` predicate remains as application-level defense-in-depth.

## Why both application ownership predicates and RLS?

They protect different failure modes.

- application ownership checks make intent explicit and give stable unavailable/not-found semantics;
- RLS protects against an accidentally broad or missing ownership predicate in SQL;
- neither replaces trusted authentication or user approval;
- neither protects against a fully compromised trusted backend that deliberately impersonates another user.

## WriteUnitOfWork API

The domain port changed from:

```text
run(work)
```

to:

```text
run(authenticatedUserId, work)
```

That turns missing user scope into an API-shape/typecheck problem for application code.

The in-memory adapter mirrors this ownership model so unit tests do not pass with cross-user operations that production PostgreSQL would reject.

## Application services

`captureAndPropose` and `applyCalendarPlanProposal` derive the scope only from `WriteRequestContext.principal.userId` and pass that identity into every private transaction.

The browser, proposal payload, interpreter, Life OS AI and ChatGPT do not supply the database user scope.

## Proposal review

`PostgresProposalReviewReader` binds the authenticated principal through the same transaction-local database context before reading Capture / interpretation / proposal rows.

Cross-user review remains indistinguishable from unavailable.

## Interaction & Change Ledger compatibility

This change preserves the provenance chain required by `INTERACTION_CHANGE_LEDGER_V1.md`:

```text
Capture
  → interpretation
  → proposal
  → user approval
  → canonical Calendar state
  → CALENDAR_EVENT_CREATED
```

RLS changes who can see or mutate private records; it does not remove correlation IDs, proposal IDs, Capture IDs, event IDs, actor identity, or source provenance.

The future user-facing ledger remains a projection over those trustworthy records. Technical database authorization failures remain developer/security telemetry and are not automatically Life Timeline events.

## PostgreSQL proof

The integration suite creates a real login-capable application role that is:

- non-superuser
- non-owner
- `NOBYPASSRLS`

The real `PostgresWriteUnitOfWork` and `PostgresProposalReviewReader` then execute:

```text
Capture → Review → Apply
```

under that role.

The proof checks:

- Capture/interpretation/proposal creation succeeds for the authenticated owner;
- review returns USER_SOURCE / OBSERVATION / SUGGESTION authority classes correctly;
- another user cannot review the Capture;
- another user cannot apply the proposal;
- the correct user can commit Calendar state + domain event + applied proposal atomically;
- correlation from the original Capture reaches the domain event;
- an unscoped query using the real application role sees zero private rows;
- blank authenticated scope is rejected before private SQL work begins.

## Deployment implication

When Supabase/Railway development infrastructure is introduced, the Railway backend database credential must use a role with the same security properties:

- server-only credential;
- non-superuser;
- non-table-owner;
- no `BYPASSRLS`;
- required grants only.

The backend must continue to derive the bound user ID from verified authentication context.

No browser database credential should be introduced for these private application services.

## Not introduced here

- production Supabase project
- Railway deployment
- Supabase Auth adapter
- public HTTP endpoints
- production secrets
- real personal data
- live Apply UI
- Life OS AI provider
- technical telemetry collector
- user-visible Interaction & Change Ledger UI

This slice only makes the already-proven PostgreSQL authorization model unavoidable in the current application adapters.
