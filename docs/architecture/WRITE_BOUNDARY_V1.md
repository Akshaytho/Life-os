# Life OS — Proposal → Confirm → Commit Boundary V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Change classification:** EXTENSION + REFINEMENT  
**Status:** executable write-boundary contract with PostgreSQL proof

## Product question

How can Life OS turn an approved proposal into canonical state without allowing AI interpretation, client-supplied identity, partial failure, duplicate clicks, idempotency collisions, or missing provenance to corrupt the user's life record?

## Core invariant

For every meaningful canonical mutation:

```text
AUTHENTICATED SERVER CONTEXT
        +
USER APPLY / CONFIRM
        ↓
CANONICAL STATE CHANGE
        +
MEANINGFUL DOMAIN EVENT
        +
APPLIED-PROPOSAL MARKER
        ↓
ONE TRANSACTION
```

Either the canonical mutation, event and applied marker all commit or none do.

## First supported mutation

V1 proves the boundary with `CREATE_CALENDAR_PLAN` after Capture → Interpret → Route → Propose.

The application contract has both in-memory unit tests and a PostgreSQL integration proof.

## Identity / authority rule

The proposal or HTTP body is **not** an authority source for user identity.

The application service receives two different shapes:

1. proposal/command data — untrusted request semantics to validate
2. `WriteRequestContext` — trusted server context populated by the authentication/transport layer

The trusted context supplies:

- authenticated USER principal ID
- transport/source classification
- server-side request-received timestamp
- request ID

The command intentionally does not own actor ID, event source or confirmation timestamp.

A malicious payload may contain extra fields named `actorId`, `source` or `confirmedAt`; they must not affect canonical ownership, event actor/source, or event occurrence time.

The proposal may eventually originate from deterministic parsing, Life OS AI or ChatGPT, but a user-confirmed Calendar event is authoritative because the authenticated user performed the Apply/Confirm action. The event actor is therefore `USER`.

## Backend revalidation

Apply is never a blind replay of UI state. Before the transaction, the application service validates at least:

- authenticated user ID exists in trusted request context
- trusted request ID exists
- trusted request timestamp is valid
- proposal identity exists
- destination is Calendar
- operation is `CREATE_CALENDAR_PLAN`
- explicit Apply/Confirm occurred
- high-authority approval is not being smuggled through the ordinary Calendar path
- title exists
- category is resolved
- Calendar timestamps are valid
- end is after start

Once proposal persistence/auth are connected, the backend must additionally revalidate stored proposal ownership/state, current entity revisions, authorization and relevant Calendar conflicts.

## Idempotency

`proposalId` is the logical idempotency key.

The applied marker stores the authenticated user plus a SHA-256 fingerprint of authoritative mutation semantics. The fingerprint includes the trusted authenticated user/source, but excludes transport-only `requestId` and `receivedAt`, so a legitimate network retry can return the original receipt.

Replay behavior:

- same proposal + same authenticated user + same mutation semantics → original receipt
- same proposal + different authenticated user → reject
- same proposal + different mutation semantics → reject

The PostgreSQL schema also protects proposal identity with uniqueness constraints.

## Transaction steps

Inside one `WriteUnitOfWork`:

1. inspect existing applied proposal
2. validate replay user/fingerprint when present
3. create canonical Calendar record
4. append `CALENDAR_EVENT_CREATED`
5. mark proposal applied with entity/event references and request fingerprint
6. commit

Any failure rolls back the transaction. The PostgreSQL adapter discards its pooled client if rollback itself fails.

## Event semantics

For the first Calendar create event:

- `user_id` and `actor_id` come from authenticated server context
- `actor_type` is USER
- `source` comes from trusted transport context
- `occurred_at` is the server-side request-received time for the authoritative Apply/Confirm action
- `recorded_at` is the persistence commit clock
- future appointment `startsAt`/`endsAt` remain Calendar state, not event occurrence time
- correlation/proposal IDs preserve provenance
- raw Capture text is not duplicated into the event payload

## Trust boundary

```text
USER WORDS / PROPOSAL DATA        untrusted input semantics
             ↓
AI/PARSER INTERPRETATION          OBSERVATION
             ↓
PROPOSAL                          SUGGESTION / proposed effect
             ↓
AUTHENTICATED USER + APPLY        authoritative action
             ↓
CANONICAL STATE + EVENT           domain truth/history
```

AI confidence, client actor fields and client source labels cannot bypass this boundary.

## Automated proof

Unit tests prove application authority, idempotency and rollback behavior. PostgreSQL integration tests prove the same transaction invariant against a real disposable database.

The suite includes explicit proof that forged identity/source/time fields hidden in proposal-shaped input do not control committed ownership or event provenance.

## Still not implemented

- production Supabase connection
- authentication middleware/provider verification
- authorization / RLS
- persisted Capture/proposal store
- live Calendar Apply endpoint/UI
- Calendar conflict checking against live state
- production Life OS AI
- ChatGPT proposal writes
- high-authority decision commits

The current `WriteRequestContext` is the port an eventual authentication layer must populate; tests use fake trusted contexts only.

## Canonical comparison

- **ALIGNED:** canonical mutation + domain event are transactional.
- **ALIGNED:** user approval is the authority source for applied AI/parser proposals.
- **ALIGNED:** authentication identity must be server-trusted rather than client-asserted.
- **ALIGNED:** provenance/correlation remain inspectable.
- **ALIGNED:** high-authority changes do not use a low-risk path.
- **ALIGNED:** core behavior does not depend on AI.
- **REFINEMENT:** transport identity/source/time are moved out of proposal data into trusted request context.
- **NO CONFLICT:** no production auth, real data, autonomous write, or direct AI database access is added.
