# Interaction & Change Ledger Read Model V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Product companion:** `docs/product/INTERACTION_CHANGE_LEDGER_V1.md`  
**Classification:** ALIGNED + EXTENSION

## Purpose

Build the first executable, user-facing read model for the question:

> **What happened between me and Life OS, what changed because of it, and why?**

V1 reconstructs a trustworthy interaction trace from records Life OS already persists. It does not create a second source of truth and it does not mix developer telemetry into life history.

## Trace shape

```text
USER SOURCE
Capture exact text
      ↓
OBSERVATION
Life OS interpretation
      ↓
SUGGESTION × N
routing proposal(s)
      ↓
USER ACTION
APPROVED or REJECTED when trusted provenance exists
      ↓
CANONICAL CHANGE
only after an approved proposal creates a real domain event
      ↓
DERIVED SCREEN EFFECTS
NOT_RECORDED_YET in V1
```

The contract can represent:

- `AWAITING_INTERPRETATION`
- `AWAITING_REVIEW`
- `NEEDS_USER`
- `READY_FOR_APPROVAL`
- `PARTIALLY_COMMITTED`
- `COMMITTED`
- `CLOSED_NO_CHANGE`

A multi-proposal Capture is therefore not falsely described as finished just because one consequence committed.

## Authority preservation

The projection never flattens the chain into an “AI result.”

- raw Capture -> `USER_SOURCE`
- interpreter -> `OBSERVATION`
- routing proposal -> `SUGGESTION`
- explicit applied marker + event -> user `APPROVED` action / `DECISION` authority
- explicit proposal-rejection marker -> user `REJECTED` action / `DECISION` authority
- committed event -> canonical change with the proposal's intended result class

A proposal that would become a FACT remains a SUGGESTION until approval and a valid canonical event exist.

Rejecting a suggestion closes that proposed consequence but does not manufacture a canonical life change.

## Data sources

V1 reads:

- `capture_record`
- `routing_interpretation`
- `routing_proposal`
- `applied_proposal`
- `proposal_rejection`
- `domain_event`

The read is scoped through `PostgresUserScope` and explicit authenticated ownership predicates.

Another user's Capture is represented as unavailable, not as an authorization-detail leak.

## Provenance validation

The application projection rejects inconsistent terminal history.

For an `APPLIED` proposal, V1 requires:

- applied-proposal marker exists
- no rejection marker exists
- marker proposal ID matches the routing proposal
- confirming actor matches authenticated user
- domain event exists
- marker event ID matches domain event ID
- event user matches authenticated user
- event correlation ID matches the original Capture correlation ID

For a `REJECTED` proposal, V1 requires:

- proposal-rejection marker exists
- no applied marker or canonical event exists
- marker proposal ID matches the routing proposal
- rejection owner and actor match authenticated user
- trusted `rejected_at` and persistence `recorded_at` remain distinct

An open proposal must not carry either terminal provenance type.

These checks keep the human-readable ledger anchored to the same trusted chain used by the write boundaries.

## Rejection semantics

Proposal rejection is a **meaningful no-write outcome**.

```text
SUGGESTION
    ↓
USER REJECTED
    ↓
proposal state = REJECTED
    ↓
proposal_rejection provenance
    ↓
NO canonical life-domain event
```

The rejection record stores:

- proposal ID
- authenticated user owner
- trusted user-action time (`rejected_at`)
- backend persistence time (`recorded_at`)
- authenticated rejecting actor
- optional user feedback/reason

Exact retries return the original rejection. A retry with different feedback is rejected rather than silently rewriting history; editing prior feedback would require a separate explicit correction flow later.

An already APPLIED proposal cannot later be rewritten as rejected. A high-authority suggestion may still be declined safely because rejecting a suggestion does not alter the existing durable direction/decision.

## Safe event projection

V1 supports the currently executable canonical event:

- `CALENDAR_EVENT_CREATED`

The user-facing trace exposes a deliberate Calendar summary and safe fields such as title, start/end, category and commitment when present.

Arbitrary `payload_json` is not copied wholesale into the UI contract. Future event types receive explicit projections when their owning domains become executable.

## User-action time

Approval and rejection expose both action occurrence and storage where provenance supports it.

- approved action occurrence comes from the trusted canonical event `occurred_at`
- approval storage comes from the applied marker time
- rejected action occurrence comes from `proposal_rejection.rejected_at`
- rejection storage comes from `proposal_rejection.recorded_at`

This prevents a database commit timestamp from being presented as if it were necessarily the exact moment the user acted.

## Derived screen effects

V1 deliberately returns:

```text
projectionEffects.status = NOT_RECORDED_YET
projectionEffects.items = []
```

It does **not** inspect the current Today screen and claim that a particular Calendar event caused what is visible there now.

A later projection-impact mechanism must persist actual causal effects such as:

```text
Calendar event evt_123
   ↓ caused
Today capacity recomputation
```

Only then may those effects enter the ledger as historical facts.

## Technical telemetry separation

The user-facing contract excludes:

- request IDs
- request fingerprints
- database retries
- latency
- stack traces
- credentials/session material
- deployment health

Correlation ID and domain entity/event IDs remain part of provenance where needed, but engineering telemetry stays in its own future store/view.

## PostgreSQL proof

The integration suites use login-capable non-owner, non-superuser, `NOBYPASSRLS` application roles.

Representative traces include:

### Pending/no-write

```text
"My friend may visit Saturday evening"
  -> OBSERVATION: tentative
  -> SUGGESTION: Calendar candidate
  -> NEEDS_USER
  -> zero Calendar rows
  -> zero domain events
```

### Rejected/no-write

```text
same suggestion
  -> USER REJECTED
  -> rejection actor/time/reason persisted
  -> CLOSED_NO_CHANGE
  -> zero Calendar rows
  -> zero domain events
```

### Committed

```text
"Gym tomorrow at 7"
  -> OBSERVATION
  -> SUGGESTION
  -> USER APPROVED
  -> Calendar event created
  -> CALENDAR_EVENT_CREATED
  -> COMMITTED
```

Cross-user trace/rejection remains unavailable and an unscoped application-role query still sees zero private rows.

## Interaction & Change Ledger development use

This read model becomes a foundation for later testing and deployment feedback because the same stable trace can be compared against:

- expected user intent
- actual interpreter behavior
- proposal outcome
- approval/rejection behavior
- committed event when one exists
- future rendered screen impact
- user correction/feedback
- software/model version from separate technical telemetry

The user-visible trace remains private product data. It must not be exported into GitHub/CI as real personal content.

## Not introduced here

- new permanent navigation destination
- user-visible Ledger screen
- derived-screen impact persistence
- rejection-feedback edit/correction flow
- technical telemetry store
- production analytics
- Supabase/Railway connection
- production Life OS AI
- real personal data

V1 only establishes the trustworthy read/write provenance over existing synthetic/test data.
