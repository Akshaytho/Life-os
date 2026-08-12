# Life OS — Proposal → Confirm → Commit Boundary V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Change classification:** EXTENSION + REFINEMENT  
**Status:** first executable write-boundary contract

## Product question

How can Life OS turn an approved proposal into canonical state without allowing AI interpretation, partial failure, duplicate clicks, or missing provenance to corrupt the user's life record?

## Core invariant

For every meaningful canonical mutation:

```text
CANONICAL STATE CHANGE
        +
MEANINGFUL DOMAIN EVENT
        +
APPLIED-PROPOSAL MARKER
        ↓
ONE TRANSACTION
```

Either all three commit or none do.

A UI success message without its domain event is an integrity failure. An event claiming a change that was not persisted is also an integrity failure.

## First supported mutation

V1 proves the boundary with one ordinary operation:

`CREATE_CALENDAR_PLAN`

The proposal has already passed Capture → Interpret → Route → Propose. The user then performs the authoritative Apply/Confirm action.

This slice does **not** connect a production database yet. It defines the application contract plus an atomic in-memory adapter used to prove transaction semantics in automated tests. A PostgreSQL/Supabase adapter will implement the same `WriteUnitOfWork` contract later.

## Authority rule

The proposal may originate from deterministic parsing, Life OS AI, ChatGPT or another approved source in the future, but the committed V1 Calendar event is authoritative because the **user explicitly confirmed it**.

Therefore the resulting domain event actor is `USER`, not `LIFE_OS_AI` or `CHATGPT`.

The original proposal and capture remain provenance.

## Backend revalidation

Apply is never a blind replay of UI state. Before opening the transaction the application service revalidates:

- proposal identity exists in the command
- destination is Calendar
- operation is `CREATE_CALENDAR_PLAN`
- confirmation actor is USER
- the user performed an explicit Apply/Confirm action
- high-authority approval is not being smuggled through the ordinary Calendar path
- title exists
- category is resolved
- timestamps are valid
- end is after start
- confirmation timestamp is valid

Future database-backed versions will also revalidate proposal persistence, current entity revisions, permissions and conflict/capacity rules as relevant.

## Idempotency

A proposal may be submitted more than once because of double taps, browser retries, network retries or client recovery.

`proposalId` is the idempotency key for this boundary.

If the same proposal was already applied, the service returns the original committed entity/event receipt instead of creating duplicates.

## Transaction steps

Inside one unit of work:

1. Check whether `proposalId` was already applied.
2. Create the canonical Calendar record.
3. Append `CALENDAR_EVENT_CREATED`.
4. Mark the proposal as applied with entity/event references.
5. Commit the transaction.

If steps 2, 3 or 4 fail, the transaction rolls back all staged changes.

## Event semantics

The first event includes:

- event ID
- user ID
- occurred_at
- recorded_at
- actor type / actor ID
- `CALENDAR_EVENT_CREATED`
- `calendar_event` entity ID
- `WEB_APP` source
- correlation ID carried from the Capture/proposal chain
- payload containing proposal ID and the committed Calendar semantics
- schema version

`occurred_at` defaults to the Calendar plan's life-time start unless an explicit domain occurrence time is supplied. `recorded_at` comes from the authoritative commit clock.

## Trust boundary

This work intentionally keeps four things separate:

```text
USER SOURCE
    ↓
AI/PARSER INTERPRETATION       observation
    ↓
PROPOSAL                       suggestion / proposed consequence
    ↓
USER APPLY / CONFIRM           authoritative action
    ↓
CANONICAL STATE + EVENT        fact / decision according to domain
```

AI confidence never bypasses the user confirmation boundary.

## Failure behavior

The automated test adapter can inject failures at:

- Calendar record creation
- event append
- applied-proposal marker

Tests assert that no partial state survives.

## Test requirements

V1 must prove at least:

- success produces exactly one Calendar record, one domain event and one applied marker
- the event actor is USER
- correlation/proposal provenance survives
- event failure rolls back the canonical Calendar record
- applied-marker failure rolls back both Calendar record and event
- duplicate application is idempotent
- unresolved category is rejected before commit
- absent explicit confirmation is rejected before commit
- invalid time range is rejected before commit

CI runs these tests on every pull request and push to main.

## Not implemented yet

- PostgreSQL/Supabase persistence adapter
- authentication / authorization
- persisted proposal store
- real Calendar mutation UI
- conflict checking against live Calendar state
- outbox delivery
- production Life OS AI
- ChatGPT proposal writes
- high-authority decision commits

These are intentionally later. The goal of this slice is to make the write rule executable before adding more authority or data.

## Pre-build canonical comparison

- **ALIGNED:** canonical mutation + domain event are transactional.
- **ALIGNED:** user approval is the authority source for an applied AI/parser proposal.
- **ALIGNED:** provenance and correlation remain inspectable.
- **ALIGNED:** high-authority changes do not use a low-risk path.
- **ALIGNED:** core system does not depend on AI.
- **REFINEMENT:** adds applied-proposal idempotency as part of trustworthy write semantics.
- **EXTENSION:** introduces the first executable application-service and unit-of-work contract.
- **NO CONFLICT:** no production data, autonomous write or direct AI database access is added.
