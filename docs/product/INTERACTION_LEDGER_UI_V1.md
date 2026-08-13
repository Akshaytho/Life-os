# Life OS — Interaction Ledger UI V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Companion:** `docs/product/INTERACTION_CHANGE_LEDGER_V1.md`  
**Read model:** `docs/architecture/INTERACTION_CHANGE_LEDGER_READ_V1.md`  
**Classification:** ALIGNED + REFINEMENT  
**Status:** synthetic/read-only visual slice

## Product question

**What happened between me and Life OS, what changed because of it, and why?**

This screen is a contextual drill-down, not a permanent navigation destination and not an engineering audit console.

## Information hierarchy

### 1. Glance

Answer the outcome first.

Examples:

- `COMMITTED · Calendar event created`
- `CLOSED · Nothing changed`
- `NEEDS YOU · Clarification required`

The user should understand in seconds whether canonical life state changed.

### 2. Summary

Show the meaningful authority chain:

```text
YOU SAID          USER SOURCE
      ↓
LIFE OS SAW       OBSERVATION
      ↓
LIFE OS PROPOSED  SUGGESTION
      ↓
YOU CHOSE         DECISION
      ↓
DOMAIN CHANGED    FACT     // only when a canonical event exists
```

A rejected suggestion ends at `YOU CHOSE · REJECTED` and explicitly states that no canonical life record changed.

### 3. Full trace / provenance

Progressive disclosure may expose:

- Capture ID
- correlation ID
- proposal ID
- event ID
- actor/source
- occurrence vs recorded timestamps
- safe canonical change details

These identifiers support trust/debugging but remain secondary to the human explanation.

Deployment/version telemetry stays outside the default user-facing ledger.

## Authority rules

The UI must not flatten the chain into “AI changed something.”

- exact user source stays visually distinct
- interpretation remains `OBSERVATION`
- proposal remains `SUGGESTION`
- approval/rejection remains explicit user `DECISION`
- canonical change appears only when a real domain event exists

A proposal targeting FACT is still a SUGGESTION until approval and a canonical event exist.

## No-write outcomes

No-write outcomes are first-class history.

For a rejected suggestion:

```text
SUGGESTION
   ↓
USER REJECTED
   ↓
NO CANONICAL CHANGE
```

The screen should not make a rejected interaction look incomplete or failed. It was a completed user choice whose result was intentionally no mutation.

## Derived screen effects

V1 must not infer downstream screen changes from current UI state.

If `projectionEffects.status = NOT_RECORDED_YET`, show a quiet line such as:

> Derived screen effects are not recorded for this interaction yet.

Do not claim that Today changed because Calendar changed until causal projection-impact data is actually persisted.

## Relationship to Capture Review

Capture Review is the pre-commit trust surface:

`source → observation → suggestion → review`

Interaction Ledger is the later historical explanation:

`source → observation → suggestion → user action → canonical result / no-write result`

They use the same authority language but serve different moments.

## Relationship to Memory

Memory may help the user recall that a change happened and provide a contextual entry into the ledger.

Memory does not own the interaction chain. The ledger remains a cross-cutting explanation of Life OS behavior.

V1 may expose a synthetic “View sample change trace” link from Memory purely to make the drill-down reachable while persistence is not connected.

## Visual metaphor

**Human-readable evidence chain.**

Use the existing Life Instrument language:

- warm canvas
- deep-ocean outcome instrument
- coral for active/decisive user action, not generic decoration
- mono authority/provenance labels
- spatial chain/causation rail
- progressively quieter technical identifiers

Avoid:

- terminal/log aesthetics
- dense JSON
- giant ID tables
- generic activity feed cards
- success/confetti treatment
- AI-centric framing

## Mobile

The first phone viewport should establish:

1. interaction status
2. human outcome
3. whether canonical state changed
4. beginning of the authority chain

The bottom dock must not cover a live control. V1 controls are read-only links/details only.

The chain stacks vertically on mobile.

## Desktop

Use width to show the authority chain as a connected working field without making each step equal-weight.

The final canonical result or explicit no-write outcome should remain visually dominant.

## V1 sample states

### Approved / committed

Synthetic input:

`Gym tomorrow at 7`

Expected trace:

- user source
- confirmed-plan observation
- Calendar suggestion
- user approved
- `CALENDAR_EVENT_CREATED`
- `COMMITTED`
- projection effects `NOT_RECORDED_YET`

### Rejected / closed no change

Synthetic input:

`My friend may visit Saturday evening.`

Expected trace:

- user source
- tentative observation
- Calendar suggestion
- user rejected
- no canonical event
- `CLOSED_NO_CHANGE`
- projection effects `NOT_RECORDED_YET`

All content is synthetic and must not be treated as real user history.

## Interaction boundary V1

- no live private API fetch
- no real user data
- no approve/reject action
- no mutation
- no technical telemetry retrieval
- no projection-impact inference

The component should accept the existing `InteractionChangeTrace` contract so later transport wiring does not require redesigning the authority model.

## Acceptance checks

- In five seconds, the user knows whether anything changed.
- Source / observation / suggestion / decision / fact cannot be confused.
- Rejected/no-write state looks complete rather than broken.
- No canonical change is displayed without a canonical event.
- Derived effects are honestly marked unrecorded in V1.
- Technical IDs are available but visually secondary.
- No raw developer telemetry appears.
- The screen works for both approved and rejected sample traces at 390 / 430 / 768 / 1440.
- Existing permanent destinations remain visually stable.

## Canonical comparison

- **ALIGNED:** user-visible ledger explains meaningful interactions and resulting state transitions.
- **ALIGNED:** no-write outcomes are meaningful history.
- **ALIGNED:** authority classes remain visible.
- **ALIGNED:** source change and derived projection effect remain distinct.
- **ALIGNED:** progressive disclosure is Glance → Summary → Full Trace.
- **ALIGNED:** technical telemetry remains separate.
- **REFINEMENT:** defines a concrete contextual detail screen over the existing read model.
- **NO CONFLICT:** no new permanent navigation destination or canonical write path is introduced.
