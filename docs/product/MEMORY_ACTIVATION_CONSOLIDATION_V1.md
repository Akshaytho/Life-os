# Life OS — Memory Activation + Consolidation V1

**Canonical basis:** `LIFE-OS-CANON-001` v1.2.0  
**Extends:** `MEMORY_DESIGN_V1.md`, `docs/architecture/MEMORY.md`  
**Change class:** ALIGNED implementation of Memory, Reviews, Journey, Ask, and provenance  
**Status:** binding V1 implementation specification

## Product outcome

Memory becomes a private, persisted recall surface for the first time.

The user can:

- see a few references to current truth without duplicating its ownership;
- retrieve explicitly retained memories by words, type, authority, and source;
- inspect where every retained memory came from;
- review candidate learnings and reflections without promoting them automatically;
- retain a candidate only after an explicit confirmation;
- revise an important memory without destroying its earlier version;
- see contradictions as separate, unresolved evidence;
- move from month to week to source through existing Reviews.

Memory remains an instrument for trustworthy recall, not a feed, a diary dump, a
score, or an authority over Direction, Journey, Calendar, Today, or Reviews.

## Non-negotiable authority rules

1. Recency is not authority.
2. Memory references current truth; the owning domain remains canonical.
3. Review and Journey candidate text remains `REFLECTION` after retention.
4. Retention does not convert a reflection into a fact or decision.
5. AI output cannot create, revise, contradict, archive, or promote a Memory item.
6. Vector similarity is not used in V1 and no similarity score is exposed.
7. Contradictions are linked and labeled; they are never silently resolved.
8. Revisions preserve history; there is no delete endpoint.
9. Raw memory text is never copied into a domain-event payload.
10. Every persisted Memory item has a user, source, authority, lifecycle, and
    immutable version identity.

## V1 scope

### Included

- authenticated `GET /api/v1/memory/overview`;
- authenticated `POST /api/v1/memory/items` for explicit candidate retention;
- authenticated `PUT /api/v1/memory/items/:rootId` for explicit revision;
- deterministic lexical recall over the user's current Memory items;
- trusted-now references from canonical Direction, Journey, and Calendar owners;
- candidate discovery from:
  - Periodic Review `worth_preserving` text;
  - Journey Practice `retained_learning_candidate` text;
- current retained Memory items with source disclosure;
- latest monthly review with contained weekly-review summaries;
- immutable Memory versions and one current revision per root;
- explicit relationships: `NEW`, `REINFORCES`, `MODIFIES`, `CONTRADICTS`;
- transactional domain events for retained and revised Memory items;
- forced RLS and a separately revocable application capability role;
- authenticated `/memory` UI and deterministic synthetic visual-review fixture.

### Deliberately excluded

- background or scheduled consolidation;
- automatic candidate promotion;
- AI-authored Memory text;
- embeddings or vector search;
- similarity/confidence scores;
- silent deduplication;
- automatic contradiction resolution;
- deleting Memory items or versions;
- bulk import;
- person-profile inference;
- diagnosis or health interpretation;
- changing Direction, Journey, Calendar, Today, Review, Drift, or NOT NOW state;
- hosted migration, capability grant, production activation, deployment, or merge.

## Feature and runtime boundary

The capability is disabled unless:

```text
LIFE_OS_MEMORY_ENABLED=true
```

Production V1 refuses activation. The runtime also requires the private API and
the source capabilities whose tables Memory reads. Missing tables, RLS, policies,
or grants fail readiness; the UI never substitutes synthetic personal data.

## Persisted model

### `memory_item`

Each row is one immutable revision.

| Field | Rule |
|---|---|
| `memory_item_id` | immutable revision identity |
| `root_id` | stable identity across revisions |
| `revision` | positive, increasing integer |
| `user_id` | required RLS owner |
| `kind` | `LEARNING`, `EXPERIENCE`, `REFLECTION`, `PERSON_CONTEXT`, or `DECISION_HISTORY` |
| `title` | user-confirmed, 1–200 characters |
| `body` | user-confirmed, 1–4000 characters |
| `authority_class` | V1 writes only `REFLECTION` |
| `source_domain` | `PERIODIC_REVIEW` or `JOURNEY_PRACTICE` |
| `source_entity_id` | exact source record identity |
| `source_occurred_at` | time belonging to the source |
| `relationship` | `NEW`, `REINFORCES`, `MODIFIES`, or `CONTRADICTS` |
| `related_root_id` | required for non-`NEW` relationship |
| `status` | `CURRENT` or `SUPERSEDED` |
| `supersedes_memory_item_id` | prior current revision when revising |
| `retained_at` | user action time |
| `recorded_at` | persistence time |
| `ended_at` | set only when superseded |
| `request_id` / fingerprint | idempotent write identity |

Constraints enforce:

- exactly one current revision per `(user_id, root_id)`;
- revision one is its own root and does not supersede a row;
- later revisions supersede the immediately current row;
- a non-`NEW` relationship points to another root owned by the same user;
- a root cannot relate to itself;
- source identity is retained on every version;
- no cascading delete.

### Source uniqueness

A source candidate can seed at most one Memory root for a user. Revising that
root does not create a second promotion. This prevents repeated clicks from
turning one reflection into several near-duplicate memories.

## Candidate rules

Candidates are read from their owning source tables. They are not copied into a
Memory-candidate table.

### Periodic Review

- Only the current review revision is eligible.
- `worth_preserving` must be present and non-empty.
- Authority remains `REFLECTION`.
- The source label includes period kind and exact local date range.

### Journey Practice

- The practice session must be completed.
- `retained_learning_candidate` must be present and non-empty.
- Authority remains `REFLECTION`.
- The source label includes the technique and completion time.

If an owning source is later revised, the retained Memory version remains valid
historical evidence and points to the exact source revision that existed when it
was retained. The system does not silently rewrite Memory.

## Retention workflow

1. The server returns a candidate with exact source identity, excerpt, authority,
   and whether it has already been retained.
2. The user chooses a Memory kind and confirms the title/body.
3. The user chooses `NEW`, or explicitly links it as reinforcement,
   modification evidence, or contradiction to an existing Memory root.
4. The confirmation screen states that the source remains a reflection and that
   no owning domain changes.
5. The server re-reads the candidate under the same user-scoped transaction.
6. The server verifies the source is still eligible and was not already promoted.
7. One Memory revision and one content-minimal domain event commit atomically.

V1 does not ask AI whether a candidate is important.

## Revision workflow

A revision is an explicit correction or refinement of an existing Memory root.

- The client supplies the expected current revision identity.
- The server locks the current row.
- A stale expected identity returns a conflict.
- The old row becomes `SUPERSEDED` with `ended_at`.
- The new row increments `revision`, retains the root identity and source link,
  and becomes `CURRENT`.
- Earlier versions remain readable in history.
- Revision never changes another domain's canonical state.

## Contradictions and consolidation

V1 consolidation is user-directed linking, not automatic merging.

- `REINFORCES` adds related evidence without replacing the related root.
- `MODIFIES` says the new evidence may refine another root; both remain visible.
- `CONTRADICTS` creates an unresolved contradiction link; both remain visible.
- `NEW` has no related root.

The overview exposes relationship labels and related-root titles. It never
selects a winner. An active Journey or Direction decision continues to outrank a
newer Memory reflection.

## Read model

`GET /api/v1/memory/overview` accepts:

- optional `q` with 1–200 characters;
- optional `kind`;
- optional `authority`;
- required IANA `timeZone` for date labels and next-commitment calculation.

The response contains:

1. `trustedNow`
   - active Direction decision, if available;
   - active Journey capability decision, if available;
   - next Calendar commitment, if available;
   - each item names its canonical owner and source.
2. `candidates`
   - eligible Periodic Review and Journey Practice candidates;
   - retained candidates remain visible as retained provenance, not as prompts.
3. `items`
   - current Memory revisions only;
   - deterministic lexical filtering over title/body/source label;
   - authority and provenance retained;
   - no ranking score exposed.
4. `timeCompression`
   - latest current monthly review;
   - current weekly reviews contained by that month;
   - review authority stays `REFLECTION` / derived time compression.
5. `patterns`
   - empty in V1 unless a future explicit pattern persistence model exists.

Default ordering is authority, then source time, then stable identity. It is not
"newest means truest."

## API semantics

### Retain

`POST /api/v1/memory/items`

Requires `Idempotency-Key` and:

- `sourceDomain`;
- `sourceEntityId`;
- `kind`;
- `title`;
- `body`;
- `relationship`;
- `relatedRootId` when relationship is not `NEW`.

### Revise

`PUT /api/v1/memory/items/:rootId`

Requires `Idempotency-Key`, `expectedCurrentItemId`, and the complete next
title/body/kind. Partial silent patching is not allowed.

### Errors

The API distinguishes validation, unauthenticated, forbidden, unavailable,
candidate-not-found, already-retained, stale-version, related-root-not-found,
idempotency-conflict, and persistence failures.

## Event integrity

Transactional events:

- `MEMORY_ITEM_RETAINED`
- `MEMORY_ITEM_REVISED`

Payloads may include identities, revision, kind, authority, source domain,
relationship, and timestamps. They must not include title, body, source excerpt,
or raw review/practice text.

## Database security

- `memory_item` has RLS enabled and forced.
- Policy uses `lifeos_current_user_id()` for `USING` and `WITH CHECK`.
- `PUBLIC`, `anon`, `authenticated`, and `service_role` receive no table rights.
- A dedicated Memory capability role receives only required table/sequence rights.
- The role receives read-only access to exact source tables.
- It receives no delete, truncate, ownership, schema-creation, or bypass-RLS right.
- Readiness verifies the migration, policy, forced RLS, function execution, and
  exact grants before accepting traffic.

## UI contract

### Real `/memory`

- private-session boundary first;
- live recall field with deterministic persisted filtering;
- `TRUSTED NOW` owner references;
- `WORTH KEEPING` retained items;
- candidate rail with explicit `REVIEW TO RETAIN` action;
- provenance disclosure on every retained item;
- time compression linked to Reviews;
- contradictions visually lower than active decisions;
- empty states that never invent personal history;
- explicit statement: `No automatic memory.`

### Confirmation

Before retention, the UI repeats:

- this remains a reflection;
- retaining it does not make it a fact or decision;
- source domains do not change;
- linked contradictions remain unresolved.

### Responsive verification

Inspect real browser renders at 390, 430, 768, and 1440 pixels. The phone's first
viewport establishes private Memory, live recall, and the start of trusted
anchors without the bottom dock covering an input or primary action.

## Acceptance checks

1. An unauthenticated request cannot retrieve candidates or Memory items.
2. One user cannot read, link, revise, or infer another user's Memory.
3. A candidate is never retained without an explicit authenticated write.
4. Retention preserves exact source identity and `REFLECTION` authority.
5. Retrying the same request is idempotent; reusing a key with different input
   conflicts.
6. A source cannot seed two Memory roots.
7. Revisions preserve history and reject stale expected identities.
8. Contradictions remain separate and unresolved.
9. Current owner references outrank retained reflections in presentation.
10. Search exposes no vector/similarity/confidence score.
11. Event payloads contain no raw Memory or source text.
12. RLS is forced and the capability role is least-privileged and revocable.
13. The real UI shows no synthetic personal data.
14. No score, streak, mastery meter, engagement device, or diagnosis appears.
15. No hosted migration, grant, production activation, deployment, or merge is
    performed as part of this draft.

