# Proposal Decisions V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.2.0  
**Extends:** `BROWSER_CAPTURE_TRANSPORT_V1.md`  
**Product predecessor:** `CAPTURE_REVIEW_UI_V1.md`  
**Change classification:** ALIGNED + EXTENSION  
**Environment:** local / development only

## Purpose

Connect the already-reviewed private proposal action endpoints to the authenticated browser without turning a SUGGESTION into a generic one-click approval surface.

The authority chain remains:

```text
USER SOURCE
    ↓
OBSERVATION
    ↓
SUGGESTION
    ↓
USER DECISION
    ↓
SERVER REVALIDATION
    ↓
CANONICAL CHANGE (only when a reviewed backend boundary supports it)
```

The browser never decides that a proposal is valid merely because it can render an Apply button.

## Apply boundary

V1 exposes Apply only when the current review says all of the following:

- destination is `CALENDAR`;
- operation is `CREATE_CALENDAR_PLAN`;
- state is `READY_TO_APPLY`;
- approval mode is not `HIGH_AUTHORITY_APPROVAL`.

Even then, the user must take two distinct UI actions:

1. `Review Apply`
2. `Confirm + create Calendar`

Only the second action sends:

```json
{
  "confirmation": {
    "explicit": true
  }
}
```

to `POST /api/v1/proposals/:proposalId/apply`.

The backend independently requires an authenticated USER principal, reloads the proposal under RLS/transaction lock, requires `READY_TO_APPLY`, rejects high-authority approval, validates Calendar category/commitment/time fields, and commits the Calendar row + domain event + applied-proposal marker atomically.

Therefore the browser's eligibility check is UX guidance, not an authorization control.

## Reject boundary

Any proposal that is not already `APPLIED` or `REJECTED` can enter a two-step rejection flow:

1. `Reject suggestion`
2. `Confirm rejection`

The user may attach up to 1000 characters of optional feedback.

Rejection records user decision provenance and changes the proposal to `REJECTED`; it does not create a Calendar/domain canonical entity.

The backend independently revalidates ownership and current state. Repeating the exact same rejection is idempotent; conflicting rejection feedback is refused.

## Replay / uncertain delivery

Network failure after a mutation request is inherently ambiguous from the browser's point of view.

The UI therefore does not claim failure means "nothing happened". The user may retry:

- Apply returns the already-recorded applied receipt when the same proposal was committed;
- Reject returns the existing rejection receipt when the same proposal/reason was already recorded;
- after any successful receipt, the browser reloads both Proposal Review and Interaction & Change Trace from the server.

The refreshed server state, not optimistic browser state, is the visible source of truth.

## High-authority changes

`HIGH_AUTHORITY_APPROVAL` is never converted into a normal Apply button in V1.

The UI states that a dedicated high-authority flow is required. The existing backend also refuses high-authority Calendar apply requests.

This preserves the principle that adding a generic browser action must not silently flatten authority tiers.

## Unsupported canonical destinations

V1 does not invent apply behavior for:

- Journey;
- Memory;
- You;
- Drift;
- Not Now;
- Brain Dump;
- any future proposal operation.

Those suggestions can be reviewed and rejected, but cannot create canonical state until their owning domain has a separately reviewed commit boundary.

## Browser/API security

This slice continues to use the bearer-token transport introduced by Browser Capture Transport V1:

- normal Supabase user session only;
- no cookie-auth/CSRF path;
- no service-role key;
- no database credential in browser code;
- exact-origin private CORS;
- no wildcard or credentialed CORS;
- server performs identity/ownership/authority validation for every action.

## UI trust language

Before decision:

- `LIFE OS PROPOSES · SUGGESTION`
- `IF APPROVED → ...`

After server-confirmed decision:

- `Applied by user decision`, or
- `Rejected by user decision`.

A browser click is never shown as a completed change until the private API returns success and the browser reloads the persisted Review + Trace.

## Acceptance checks

- no generic Apply for unsupported destinations/operations;
- no Apply for `PROPOSED`, `NEEDS_CONFIRMATION`, `APPLIED`, or `REJECTED` states;
- no normal Apply for `HIGH_AUTHORITY_APPROVAL`;
- eligible Calendar Apply requires a second explicit confirmation action;
- Reject requires a second confirmation action;
- optional rejection reason is bounded to 1000 characters;
- all decision requests use the authenticated private API;
- no optimistic state transition is treated as authoritative;
- Review + Trace reload after successful mutation;
- ambiguous network delivery is described without falsely claiming no mutation occurred;
- existing backend Apply/Reject validation remains unchanged and authoritative;
- sample/read-only UI stays the default when live browser configuration is absent;
- CI, transaction-boundary tests, behavior gates, web build, and visual review remain green.

## Canonical comparison

- **ALIGNED:** SUGGESTION remains lower authority than USER DECISION.
- **ALIGNED:** explicit confirmation is required before the supported canonical Calendar commit.
- **ALIGNED:** backend ownership/authority checks remain authoritative; client checks are presentation only.
- **ALIGNED:** high-authority proposals are not flattened into ordinary approval.
- **ALIGNED:** unsupported domain writes are not invented by the browser.
- **ALIGNED:** completed changes are derived from persisted server state and Interaction & Change Trace.
- **EXTENSION:** live authenticated review gains deliberate user Apply/Reject actions for already-existing private API boundaries.
