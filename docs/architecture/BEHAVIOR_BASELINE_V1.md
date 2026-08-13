# Life OS — Behavior Baseline V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Depends on:** `BEHAVIOR_REGRESSION_V1.md`  
**Classification:** ALIGNED + REFINEMENT

## Why

A generated behavior report tells us what a release did. A baseline tells code review what we currently expect it to do.

Without a version-controlled baseline, semantic assertions can remain hidden inside workflow scripts. With the baseline, an intentional behavior change becomes an explicit repository change that can be compared against the canonical product artifact.

## Baseline file

`tests/behavior/baseline-v1.json`

It contains only the privacy-safe semantic shape already permitted in behavior-regression artifacts:

- stable scenario ID
- interaction status
- proposal count
- destination
- operation
- proposal state
- proposed result class
- approved/rejected action when present
- canonical event type when present
- projection-effects recording status

The baseline contains no raw life text, user IDs, Capture/proposal/event IDs, payloads, reasons or environment credentials.

It also records which canonical artifact version reviewed the expectation:

`LIFE-OS-CANON-001@1.2.0`

## V1 expected behavior

### tentative-calendar-needs-user

- NEEDS_USER
- one Calendar create suggestion
- NEEDS_CONFIRMATION
- proposed FACT
- no canonical event

### confirmed-calendar-approved

- COMMITTED
- one Calendar create suggestion
- APPLIED
- proposed FACT
- USER APPROVED
- CALENDAR_EVENT_CREATED

### tentative-calendar-rejected

- CLOSED_NO_CHANGE
- one Calendar create suggestion
- REJECTED
- proposed FACT
- USER REJECTED
- no canonical event

## Semantic comparison

The comparator deliberately ignores:

- report generation time
- release SHA differences
- deployment metadata
- proposal ordering

Proposal ordering is not treated as semantic because a single Capture may route to multiple owning domains and the backend/UI may represent equivalent proposals in different stable orders.

It does compare:

- scenario addition/removal
- interaction status
- proposal count
- projection-effects state
- the multiset of proposal semantic signatures

A proposal signature includes destination, operation, state, proposed result class, user action, and canonical event type.

## CI gate

`Life OS Behavior Baseline` regenerates behavior against disposable PostgreSQL/RLS using the same synthetic end-to-end generator as the behavior artifact workflow, then compares it with the committed baseline.

If behavior changes unintentionally, CI fails.

If behavior changes intentionally:

1. compare the proposed behavior against the current canonical artifact;
2. decide whether it is aligned/refinement/extension/conflict;
3. update implementation;
4. update `baseline-v1.json` in the same PR when the semantic expectation truly changes;
5. update/version the canonical artifact first if the change supersedes doctrine;
6. rerun all behavior/UI/security gates.

The baseline is therefore not an authority above the Product Doctrine. It is an executable expectation derived from it.

## Privacy boundary

Do not create baselines from real user traces by copying their content.

When a real user correction exposes a regression class:

```text
private user correction
      ↓
understand the semantic failure
      ↓
create synthetic reproduction
      ↓
add synthetic scenario + baseline expectation
```

The private source remains in Life OS; only the synthetic behavior class enters Git/CI.

## Not introduced

- real-user snapshots
- AI wording snapshots
- private payload fixtures
- autonomous baseline updates
- automatic acceptance of changed behavior
- production analytics
- external deployment/resource changes

A baseline update is always a deliberate reviewed repository change.
