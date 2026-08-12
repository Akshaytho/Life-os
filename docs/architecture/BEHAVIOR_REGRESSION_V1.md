# Life OS — Behavior Regression V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Companions:** `INTERACTION_CHANGE_LEDGER_V1.md`, `TECHNICAL_TELEMETRY_V1.md`  
**Classification:** ALIGNED + EXTENSION

## Purpose

Continuously verify **what Life OS does**, not only whether code compiles.

The behavior-regression workflow runs synthetic interactions through the real PostgreSQL/RLS/application-service chain and emits a content-free report tied to the Git commit that produced the behavior.

This gives development a repeatable feedback loop before real-user telemetry exists.

## V1 scenarios

### Tentative plan / needs user

Expected behavior:

```text
synthetic Capture
  -> OBSERVATION
  -> Calendar SUGGESTION
  -> NEEDS_CONFIRMATION
  -> interaction status NEEDS_USER
  -> no canonical event
```

### Confirmed Calendar plan / approved

Expected behavior:

```text
synthetic Capture
  -> OBSERVATION
  -> Calendar SUGGESTION
  -> USER APPROVED
  -> Calendar FACT
  -> CALENDAR_EVENT_CREATED
  -> interaction status COMMITTED
```

### Tentative plan / rejected

Expected behavior:

```text
synthetic Capture
  -> OBSERVATION
  -> Calendar SUGGESTION
  -> USER REJECTED
  -> no canonical event
  -> interaction status CLOSED_NO_CHANGE
```

The scenarios use fake CI-only text and identities. They are not examples of real user data and they do not become product doctrine.

## Report shape

The uploaded JSON artifact contains only:

- schema version
- generation time
- environment / release SHA / platform
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

It deliberately excludes:

- source text
- observations/interpretation prose
- proposal summary/reason
- payload JSON
- user/actor identity
- Capture/proposal/event/request IDs
- deployment/service IDs
- credentials/configuration
- error messages

This artifact is therefore suitable for CI comparison without becoming a copy of private Life OS history.

## Workflow

`.github/workflows/behavior-regression.yml` runs on pull requests and pushes to main.

It:

1. starts disposable PostgreSQL;
2. installs dependencies;
3. creates an isolated schema and non-owner / non-superuser / `NOBYPASSRLS` app role;
4. applies migrations 0001 → current;
5. runs the three synthetic scenarios through the actual Capture / Apply / Reject / Interaction Ledger services;
6. builds the normalized behavior report;
7. asserts the expected behavior contract;
8. recursively rejects private/unstable fields in the artifact;
9. uploads the report for 14 days, named with the Git SHA;
10. removes the isolated schema/role before process exit.

## Release comparison

Because each artifact carries the release SHA, a later developer tool can compare:

```text
release A behavior report
        ↓
release B behavior report
        ↓
which scenario changed?
        ↓
inspect code + Interaction Ledger semantics
        ↓
accept intentional change or fix regression
```

No real-user content is needed for this baseline comparison.

When production Life OS AI is introduced later, additional synthetic scenarios can cover routing/teaching behavior, but expected outcomes must be defined semantically rather than freezing exact prose.

## Relationship to user feedback

Synthetic regression is the safe first layer.

Later, with privacy controls and explicit permission, user corrections can reveal missing scenarios:

```text
user says Life OS misunderstood something
        ↓
inspect private Interaction & Change trace
        ↓
identify behavior class
        ↓
create synthetic reproduction
        ↓
add/adjust regression scenario
        ↓
new release
        ↓
compare normalized behavior
```

The real user record never needs to be copied into the regression artifact.

## Not introduced

- production analytics
- real-user telemetry export
- private data in CI
- model-output snapshot testing
- exact natural-language prose assertions
- Supabase/Railway external resources
- live deployment automation
- autonomous rollback/deploy decisions

V1 is a deterministic, synthetic behavior contract for the trustworthy application flows that already exist.
