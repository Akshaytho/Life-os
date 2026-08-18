# Drift Detector + Return V1

Status: binding implementation specification  
Canonical basis: `LIFE-OS-CANON-001 v1.2.0`  
Classification: ALIGNED implementation of the explicit Drift and return workflow

## Purpose

Life OS does not aim for perfect focus or zero drift. It aims to make noticing drift safe, understanding it deliberate, and returning to a chosen direction reliable.

Drift Detector V1 is therefore not a background judge and not an AI diagnosis. It begins only when the user explicitly chooses **I'm Drifting**. It records what the user says is happening, helps the user classify the moment, and preserves the user's return decision without silently changing Direction, Journey, Calendar, Today, Memory, a goal, a project, or NOT NOW.

## Binding principles

- The user decides whether they are drifting. V1 does not infer drift from activity, mood, Calendar data, or missed work.
- Noticing drift is treated as progress toward return, not failure.
- The original user note is preserved exactly. Later understanding never rewrites it.
- Classification and return choices are explicit user decisions.
- AI may later offer a clearly labelled suggestion, but it cannot confirm a classification or resolution.
- A drift record never creates a goal, project, task, Calendar event, Journey change, Direction change, Memory fact, or NOT NOW item.
- A choice such as `PARK_IDEA` or `DELIBERATE_RECONSIDERATION` records the user's next posture only. The relevant owner still requires a separate explicit action before changing.
- No scores, percentages, streak punishment, urgency theatre, or shame language.
- Repeated drift moments remain separate historical occurrences. Pattern summaries are later derived observations and cannot replace those source records.

## Entry point

**I'm Drifting** is a global private action available from the Life OS shell.

The first screen asks one low-friction question:

> What is pulling you away right now?

The note may be blank when the user only has enough attention to record the moment. Choosing the action is itself explicit user source. When a note is supplied it is stored byte-for-byte after normal transport decoding; it is never rewritten by classification.

Recording the moment creates only a Drift occurrence in `RECORDED` state.

## Understanding the moment

After the occurrence exists, the user may choose the closest current explanation:

- `TEMPORARY_INSPIRATION`
- `COMPARISON`
- `AVOIDANCE`
- `EMOTIONAL_REACTION`
- `GENUINE_RECONSIDERATION`
- `UNSURE`

The user may also add three optional source notes:

- **Trigger** — what seemed to start the drift
- **Emotion** — what the user noticed feeling
- **Distraction** — what attention moved toward

These are user-authored reflection fields, not AI-derived facts. Confirming the understanding creates a new immutable decision revision and moves the current lifecycle to `UNDERSTOOD`.

## Return posture

After understanding is confirmed, the user may choose one current posture:

- `STILL_RETURNING` — keep the occurrence open without pressure
- `RETURN_TO_DIRECTION` — reaffirm the already chosen direction
- `PARK_IDEA` — preserve a possibility through a separate Brain Dump / NOT NOW action if desired
- `REFLECT_ONLY` — keep the learning without another consequence
- `ADJUST_PLAN` — consider a separate plan edit without changing it here
- `DELIBERATE_RECONSIDERATION` — open a separate high-authority Direction review without changing Direction here

`STILL_RETURNING` creates a revision and moves the lifecycle to `STILL_RETURNING`. Any other confirmed posture creates a final revision and moves it to `RESOLVED`.

The final review must state the exact consequence before the write:

> This records how you chose to respond to this drift moment. It does not change Direction or any other Life OS domain.

## Lifecycle

```text
RECORDED -> UNDERSTOOD -> STILL_RETURNING -> RESOLVED
                       \-------------------> RESOLVED
```

- An occurrence must be recorded before understanding can be confirmed.
- Understanding may be revised while the occurrence remains unresolved. Every revision is retained.
- A return posture requires a current confirmed understanding.
- An unchanged or stale revision is rejected.
- `RESOLVED` is terminal in V1. A later recurrence is a new occurrence, preserving history rather than rewriting it.
- There is no delete operation in the V1 private runtime.

## Authority

| Information | Authority | Behavior |
| --- | --- | --- |
| User's original Drift note | `USER_SOURCE` | Preserve exactly; never rewrite |
| Trigger, emotion, and distraction notes | `USER_SOURCE` | Optional user reflection; preserve per revision |
| Drift explanation | `DECISION` | Requires explicit confirmation |
| Return posture | `DECISION` | Requires explicit final review |
| AI explanation suggestion | `AI_SUGGESTION` | Optional and non-binding; not required in V1 |
| Repeated-pattern summary | `AI_OBSERVATION` | Later read-only observation; never current truth |

## Persistence

V1 adds two owner-scoped relations:

### `drift_occurrence`

Immutable source identity for one explicitly reported moment:

- `drift_id`
- `user_id`
- optional exact `source_note`
- `occurred_at`
- request and correlation provenance
- `recorded_at`

### `drift_decision`

Immutable, versioned understanding and return decisions:

- `decision_id`
- `root_decision_id`
- `drift_id`
- `user_id`
- `revision`
- `explanation`
- optional trigger, emotion, and distraction source notes
- optional return posture
- derived lifecycle state
- authority
- request provenance
- `supersedes_decision_id`
- decision and record timestamps

Exactly one current decision revision may exist per occurrence. Superseded revisions remain readable as history.

## Domain events

Every meaningful state change and its event append are one PostgreSQL transaction:

- `DRIFT_RECORDED`
- `DRIFT_UNDERSTANDING_CONFIRMED`
- `DRIFT_RETURN_RECORDED`
- `DRIFT_RESOLVED`

`DRIFT_RETURN_RECORDED` covers `STILL_RETURNING`. `DRIFT_RESOLVED` covers terminal return postures. Event payloads contain stable identifiers, lifecycle, explanation/posture codes, revision, authority, and timestamps. They never contain the user's raw note, trigger, emotion, distraction, or reflection text.

## Private API

All routes require the verified Supabase user, owner-bound PostgreSQL scope, strict bodies, no-store responses, and stable idempotency keys.

- `GET /api/v1/drifts` — current occurrences newest first with preserved decision history
- `POST /api/v1/drifts` — record an explicit moment
- `POST /api/v1/drifts/:driftId/understanding` — confirm or revise understanding
- `POST /api/v1/drifts/:driftId/return` — record `STILL_RETURNING` or resolve the occurrence

The transport resolves authentication before revealing whether a drift identifier exists. Foreign and missing identifiers share the same unavailable response shape.

## PostgreSQL and capability boundary

- Both Drift relations use and force row-level security.
- Every policy binds `user_id` to the private request scope.
- Composite ownership foreign keys prevent cross-user provenance.
- `PUBLIC`, `anon`, `authenticated`, and `service_role` receive no implicit table privileges.
- A separate Drift capability grants only the required `SELECT`, `INSERT`, and narrow `UPDATE` privileges to the non-owner application role.
- The runtime receives no `DELETE`, `TRUNCATE`, owner, migration-ledger, schema-creation, role, or RLS-bypass authority.
- Capability provisioning remains a separate reviewed operator action from schema migration.
- Runtime readiness fails closed when tables, FORCE RLS, non-ownership, indexes, policies, or exact privileges drift.

## Interface

- The global **I'm Drifting** action uses a calm return color, not danger red.
- The private `/drift` surface begins with `You noticed. That is already a return.`
- Recording remains one low-friction action; classification appears only after persistence.
- Understanding and return writes each use an explicit final-review state.
- The current chosen Direction may be shown only when the independently gated Direction read model is available. Its absence never blocks recording or return.
- Open occurrences are calm and resumable. There is no overdue state.
- Resolved history remains visible without presenting it as a performance score.
- Mobile layouts preserve thumb reach without covering decision controls or source text.

## Relationship to existing domains

- **Direction:** `RETURN_TO_DIRECTION` reaffirms intent in the Drift record only. `DELIBERATE_RECONSIDERATION` cannot edit Direction.
- **Brain Dump / NOT NOW:** `PARK_IDEA` does not create a Brain Dump classification or NOT NOW item. The UI may link to that separate explicit flow.
- **Daily Return:** later composition may show the user's explicit Drift lifecycle on the matching day. Daily Return does not infer or overwrite it.
- **Calendar / Today / Journey:** `ADJUST_PLAN` cannot mutate these domains.
- **Memory:** Drift history may later be retrieved as context, but V1 creates no Memory fact or summary.

## Telemetry and privacy

Technical telemetry may include operation, route class, outcome, stable machine error code, request/correlation identifiers, and latency. It must never contain source notes, trigger/emotion/distraction text, reflections, access tokens, database URLs, SQL, or exception text.

## Feature activation

Drift Detector + Return is independently disabled by default.

Activation requires:

1. migration plan and apply through the reviewed migration runner;
2. baseline application-role verification;
3. separate Drift capability plan and apply;
4. Drift database readiness success;
5. private API activation; and
6. explicit non-production Drift runtime activation.

The V1 runtime refuses production activation. Reversal disables the feature flag first and then revokes the separate Drift capability without deleting user data.

## Acceptance criteria

1. A user can record an explicit drift moment with zero required reflection text.
2. Optional source text is preserved exactly and never appears in technical telemetry or domain-event payloads.
3. The user can confirm one canonical explanation and later revise it while unresolved.
4. The user can remain `STILL_RETURNING` without an overdue or failure treatment.
5. A terminal return posture resolves the occurrence and cannot mutate another Life OS domain.
6. Stale, unchanged, unauthenticated, foreign-user, malformed, and replay-conflicting writes fail closed.
7. Same-key same-payload retries return the original result without duplicate revisions or events.
8. PostgreSQL tests prove forced RLS isolation, exact capability privileges, transactional revisions/events, and revocation.
9. Responsive screenshots cover the private entry boundary plus recorded, understood, still-returning, and resolved states.
10. Behavior regression continues to prove that AI cannot create commitments or replace the user's Direction.

## Safety boundary for this slice

- synthetic development data only
- no hosted Supabase migration or capability grants
- no hosted runtime configuration changes
- no real Drift data
- no deployment
- no merge
