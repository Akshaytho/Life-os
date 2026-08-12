# Life OS — Persisted Capture & Proposal Boundary V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Change classification:** EXTENSION + REFINEMENT  
**Status:** persistence contract for Apply/Confirm

## Product question

How can the user review a Life OS proposal and later press Apply without allowing the browser to redefine the proposal's structured meaning at commit time?

## Core rule

The Apply request identifies a stored proposal. It does not resend authoritative Calendar details.

```text
Capture
  raw user text stored once
      ↓
Routing proposal
  structured proposed consequence stored for the same user
      ↓
Review UI
      ↓
Apply request
  proposalId + explicit confirmation only
      ↓
Authenticated backend
  load + lock stored proposal
      ↓
validate stored proposal
      ↓
canonical mutation + event + applied markers
  one transaction
```

## Why this matters

Without a persisted proposal boundary, a malicious or buggy client could show the user one proposal and submit different title/time/category details when Apply is pressed.

V1 removes that authority from the client. The stored proposal is the source of proposed mutation semantics. The authenticated request context is the source of user identity and transport provenance. The user Apply action is the source of authority to commit.

## Persistence model

### `capture_record`

Stores the original user expression once:

- capture ID
- owning user ID
- raw text
- source
- correlation ID
- recorded timestamp

Raw Capture text is not copied into every downstream domain event.

### `routing_proposal`

Stores one structured proposal:

- proposal ID
- owning user ID
- capture ID
- destination
- operation
- approval mode
- proposal state
- structured payload JSON
- created timestamp
- applied receipt references when committed

The `(capture_id, user_id)` foreign key ensures a proposal cannot point to another user's Capture record.

For this first slice the only persisted proposal kind is:

`CALENDAR / CREATE_CALENDAR_PLAN`

The schema is intentionally narrow. Future proposal kinds should extend the contract deliberately rather than turning `payload_json` into unrestricted generic writes.

## Apply command

The application command exposed to a future endpoint is deliberately small:

- `proposalId`
- explicit confirmation flag

It does not contain:

- user ID
- event actor/source/time
- Calendar title
- Calendar date/time
- category
- commitment
- destination
- operation
- raw Capture text

Those values come from trusted server context or persisted Life OS records.

## Apply transaction

Inside the existing `WriteUnitOfWork`:

1. load the proposal for the authenticated user and lock it for update
2. inspect applied-proposal marker
3. if already APPLIED, validate stored receipt linkage and return the original receipt
4. require `READY_TO_APPLY`
5. runtime-validate stored Calendar payload
6. reject high-authority mode through this ordinary path
7. create canonical Calendar row
8. append `CALENDAR_EVENT_CREATED`
9. insert applied-proposal marker
10. mark stored routing proposal APPLIED with entity/event references
11. commit

Any failure rolls back all four mutable effects, including proposal status.

PostgreSQL uses `SELECT ... FOR UPDATE` on the stored routing proposal so concurrent Apply requests serialize around the proposal state.

## Ownership / privacy

Proposal lookup is scoped by both `proposalId` and authenticated `userId`.

A proposal belonging to another user is returned to the application as unavailable rather than exposing its contents.

Database constraints reinforce the provenance chain:

- routing proposal `(capture_id, user_id)` references the matching Capture owner
- applied proposal references a persisted routing proposal
- routing proposal applied event reference points to `domain_event`

## Trust classes

The stored proposal remains a proposed consequence. Persistence alone does not make it canonical truth.

Only after the authenticated user explicitly applies it do the canonical Calendar state and domain event become authoritative.

## Automated proof

Unit tests prove:

- Apply uses persisted Calendar semantics
- client-added replacement plan/destination/source text is ignored
- cross-user proposal lookup is unavailable
- proposal must be READY_TO_APPLY
- unresolved/invalid stored payload is rejected
- explicit confirmation remains required
- event/status failures roll back canonical state, event, marker and proposal state
- exact retry returns original receipt without duplicates

PostgreSQL integration proves:

- persisted Capture + proposal drive the real SQL commit
- routing proposal becomes APPLIED with entity/event references
- raw Capture text is not duplicated into the domain event
- exact replay remains idempotent
- another authenticated user cannot apply the proposal
- a forced failure on final routing-proposal status update rolls back Calendar, event and applied marker and restores proposal state

## Not implemented yet

- production endpoint
- production authentication/provider session verification
- authorization policy/RLS
- proposal creation application service
- Life OS AI interpreter producing persisted proposals
- live Apply UI
- editable proposal-resolution flow
- high-authority proposal types

## Canonical comparison

- **ALIGNED:** raw Capture remains source/provenance rather than canonical truth.
- **ALIGNED:** proposals remain suggestions until explicit user approval.
- **ALIGNED:** authenticated context owns user identity.
- **ALIGNED:** canonical state + event remain transactional.
- **ALIGNED:** provenance remains inspectable without unnecessarily duplicating private text.
- **REFINEMENT:** Apply no longer trusts structured mutation details resent by the browser.
- **EXTENSION:** persists Capture and routing-proposal records as the bridge between interpretation and commit.
- **NO CONFLICT:** no AI authority, navigation ownership, product role or production-data rule changes.
