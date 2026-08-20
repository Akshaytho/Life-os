# Journey Activation + Practice V1

Status: binding implementation specification  
Canonical basis: `LIFE-OS-CANON-001 v1.2.0`  
Classification: ALIGNED implementation of the first real Journey mutation

## Purpose

Journey answers what the user is deliberately becoming capable of and what real
evidence shows movement. V1 replaces the empty/sample-only Journey boundary with
one explicit capability decision and one factual practice lifecycle.

The initial supported route is **Travel Creator → Sound Design**. It is not
activated from product copy, sample data, an AI guess, or an old conversation.
The user must explicitly confirm it in the private interface.

## Binding principles

- A Journey exists only after an explicit user decision.
- Activating Sound Design does not activate future route phases.
- Starting practice records an intentional session; completing it records fact.
- Practice chronology replaces streaks, percentages, scores, and invented mastery.
- Technique evidence is categorical and historical, not a completion meter.
- User reflection remains `REFLECTION`; it is not promoted to canonical Memory.
- A retained-learning candidate remains linked to the session and is not silently
  added to Memory.
- AI cannot activate a Journey, start/complete practice, choose a technique, or
  promote a learning in this slice.
- Journey writes never create Calendar events, Today tasks, reels, Direction
  changes, goals, projects, Memory items, or NOT NOW items.

## Activation

When no current Journey capability exists, `/journey` shows a deliberate setup
surface for the initial route:

- Journey: `TRAVEL_CREATOR`
- Capability: `SOUND_DESIGN`
- Starting technique: one explicit choice from the current Sound Design field
- Optional user-authored reason

The final review states that this chooses the current capability but does not
schedule work or activate future phases.

V1 exposes no automatic or AI activation. It also exposes no capability-switch
route. A future supersession flow must preserve the earlier decision and receive
its own explicit high-authority review.

## Practice lifecycle

### Start

An activated user may start one practice session by choosing:

- a Sound Design technique;
- an optional experiment intention; and
- an explicit start action.

The technique may differ from the starting technique for a single experiment.
That does not silently change the active capability decision.

Only one session may remain open per user. A duplicate request replay returns the
original session. A different request while one is open returns the open session
boundary without creating another.

### Complete

The user may complete an open session with:

- optional reflection;
- optional retained-learning candidate; and
- an explicit completion action.

Duration is derived from recorded start/end timestamps. The system does not ask
the user to invent a duration. Completion is terminal in V1. There is no delete,
rewrite, or fabricated evidence count.

An unfinished session remains calmly resumable. It is not overdue or failed.

## Initial technique field

- `ENVIRONMENTAL_SOUND`
- `J_L_CUTS`
- `DIALOGUE_CLARITY`
- `MUSIC_RELATIONSHIP`
- `SILENCE`
- `SOUND_EFFECTS`
- `LAYERING`

These are the current Sound Design field, not a mandatory curriculum order.

## Authority

| Information | Authority | Behavior |
| --- | --- | --- |
| Active Journey/capability | `DECISION` | Explicit activation only |
| Starting/current technique choice | `DECISION` | User-confirmed |
| Practice start/completion | `FACT` | Recorded from explicit user action |
| Experiment intention | `USER_SOURCE` | Preserved exactly |
| Reflection | `REFLECTION` | Preserved; never rewritten as fact |
| Retained-learning candidate | `REFLECTION` | Session evidence only; no Memory promotion |
| Future phase labels | orientation | Never active commitments |

## Persistence

V1 adds three owner-scoped append-only relations:

### `journey_capability_decision`

- stable decision identity
- user
- Journey/capability/starting-technique codes
- optional exact decision reason
- authority and request provenance
- decision and record timestamps

Exactly one current activation exists per user in V1.

### `journey_practice_session`

- stable session identity
- user and capability-decision identity
- chosen technique
- optional exact experiment intention
- request/correlation provenance
- start and record timestamps

### `journey_practice_completion`

- stable completion identity
- user and session identity
- optional exact reflection
- optional exact retained-learning candidate
- request/correlation provenance
- completion and record timestamps

Every source row is append-only. Exactly one completion may exist per session.
The database enforces one open session per user under the private request scope.

## Domain events

Canonical state and its event append share one PostgreSQL transaction:

- `JOURNEY_CAPABILITY_ACTIVATED`
- `JOURNEY_PRACTICE_STARTED`
- `JOURNEY_PRACTICE_COMPLETED`

Event payloads contain stable identifiers, codes, authority, lifecycle, and
timestamps. They never contain the user's reason, experiment intention,
reflection, or retained-learning text.

## Private API

All routes require verified Supabase identity, owner-bound PostgreSQL scope,
strict bodies, no-store responses, and stable idempotency keys.

- `GET /api/v1/journey`
- `POST /api/v1/journey/activate`
- `POST /api/v1/journey/practice`
- `POST /api/v1/journey/practice/:sessionId/complete`

Authentication is resolved before identifiers. Foreign and missing sessions
share the same unavailable response shape.

## Read model

The Journey projection contains only canonical private data:

- current capability decision and provenance;
- current open session, if any;
- completed practice chronology newest first;
- exact session reflection/learning candidates with their authority labels;
- factual practice count by technique.

It does not synthesize reels, learnings, reviews, mastery, future commitments, or
AI observations.

## PostgreSQL capability boundary

- All three relations use and force RLS.
- Composite owner foreign keys prevent cross-user references.
- The private capability receives `SELECT` and `INSERT` only.
- It receives no `UPDATE`, `DELETE`, `TRUNCATE`, ownership, migration-ledger,
  schema, role, or RLS-bypass authority.
- Provisioning is a separate reviewed operator action after migration.
- Readiness fails closed on schema, policy, index, ownership, or grant drift.

## Interface

- `/journey` remains private and real-data-only.
- First activation uses explicit final review.
- The active screen answers Travel Creator, Sound Design, current technique,
  open practice, and real chronology without sample counters.
- Start and complete controls remain comfortable at 390 px.
- An open session is calm and resumable.
- Completion shows factual duration and user reflection separately.
- The interface never presents future phases as commitments.

## Feature activation

Journey Activation + Practice is independently disabled by default.

Activation requires migration, baseline application-role verification, separate
Journey capability provisioning, Journey database readiness, private API
activation, and explicit non-production feature activation.

The V1 runtime refuses production activation.

## Acceptance criteria

1. No Journey state appears until explicit activation.
2. Activation is replay-safe and cannot be silently repeated or switched.
3. One open practice session is enforced transactionally.
4. Start/complete retries are idempotent and conflicts fail closed.
5. Completion creates factual evidence without Memory, Calendar, Today, reel, or
   future-phase side effects.
6. Private text stays out of events and technical telemetry.
7. RLS isolates users and the app role remains append-only.
8. Revoking the separate capability makes readiness fail closed.
9. Mobile/desktop captures cover activation, open practice, and chronology.
10. Behavior regression continues to prove AI cannot create commitments.

## Safety boundary for this slice

- synthetic development data only
- no hosted Supabase migration or capability grants
- no hosted runtime changes
- no real Journey data
- no deployment
- no merge
