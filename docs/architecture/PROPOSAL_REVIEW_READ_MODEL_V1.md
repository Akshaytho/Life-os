# Life OS — Proposal Review Read Model V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Change classification:** EXTENSION + REFINEMENT  
**Status:** read-only projection contract

## Product question

How can Life OS show the user exactly what was captured, what the interpreter inferred, and what is being proposed without flattening those authority classes or exposing a write path?

## Read hierarchy

```text
WHAT YOU SAID
USER SOURCE
      ↓
WHAT LIFE OS INTERPRETED
OBSERVATION
      ↓
WHAT LIFE OS PROPOSES
SUGGESTION
      ↓
WHAT THAT PROPOSAL WOULD BECOME IF APPROVED
FACT / DECISION / REFLECTION / ...
```

The proposal itself is always displayed as a `SUGGESTION` until an authoritative action changes canonical state. `targetTrustClass` describes the class of the proposed consequence after approval; it is not the current authority of the proposal.

## Progressive disclosure

The review projection supports the product's short-UI/deep-data rule:

- **glance:** source text, review state, proposal count
- **summary:** interpretation, observations, proposal summaries, approval mode and destination
- **full context:** timestamps, interpreter provenance, proposal reason, structured review details and applied references where present

The projection does not destroy source depth. It references the same persisted Capture / interpretation / proposal records used by later Apply.

## Ownership boundary

The reader accepts a trusted authenticated user principal plus a Capture ID. Database lookup is always scoped by both values.

A Capture belonging to another user is returned as unavailable rather than leaking whether it exists.

No browser-supplied user ID becomes authoritative.

## Read states

A valid persisted Capture can be visible even when interpretation did not complete:

- `AWAITING_INTERPRETATION` — raw Capture is durable; no interpretation bundle exists yet
- `READY_FOR_REVIEW` — persisted interpretation exists; proposals may be zero or more

This makes interpreter failure visible without pretending the Capture was lost.

## Trust classes

- raw Capture source: `USER_SOURCE`
- interpreter record and observations: `OBSERVATION`
- proposal record: `SUGGESTION`
- proposed result: `targetTrustClass`

The read model never promotes an AI interpretation into FACT/DECISION merely because a proposal targets that class.

## Payload projection

The review API does not expose arbitrary internal JSON as the UI contract.

For V1:

- `CREATE_CALENDAR_PLAN` is projected into labeled review details: title, start, end, category, commitment
- other operations can rely on summary/reason until a domain-specific detail projector is deliberately added

This keeps the UI adaptive and prevents internal persistence shape from becoming accidental product doctrine.

## Applied proposals

An `APPLIED` proposal remains reviewable as history. The projection includes its applied entity/event references and timestamps, but it does not make the review reader a mutation interface.

## Pre-build canonical comparison

- **ALIGNED:** short UI can compress while full source/provenance remains retrievable.
- **ALIGNED:** FACT / REFLECTION / OBSERVATION / SUGGESTION / DECISION remain visibly distinct.
- **ALIGNED:** proposals remain suggestions until approval.
- **ALIGNED:** raw Capture and AI interpretation are not conflated.
- **ALIGNED:** authenticated ownership scopes private reads.
- **ALIGNED:** core read behavior does not require AI availability.
- **REFINEMENT:** separates proposal-current-class (`SUGGESTION`) from proposed-result class (`targetTrustClass`).
- **EXTENSION:** adds a stable, read-only review projection over persisted Capture provenance.
- **NO CONFLICT:** no canonical write authority, navigation ownership, AI role or production-auth assumption changes.
