# Life OS — Weekly + Monthly Reviews V1

**Status:** binding implementation contract for the next canonical vertical slice  
**Change class:** ALIGNED extension of Reviews, Today, Memory, Calendar, Journey, and Drift  
**Activation:** explicit private capability, disabled by default

## Product question

**Across this week or month, what meaningfully changed, what did I learn, and what
do I choose to carry forward?**

Life OS already preserves daily reflection, Calendar reality, return from drift,
NOT NOW decisions, and Journey practice. This slice compresses those records into a
calm long-period review without turning the user into a score.

Reviews own the act of time compression. The source domains still own their facts and
decisions. A periodic review remains the user's reflection about a bounded period; it
cannot silently rewrite Direction, Journey, Calendar, Memory, NOT NOW, or Drift.

## Canonical alignment

This slice implements the recovered doctrine that:

- reviews compress time and close loops;
- weekly and monthly reviews summarize meaningful change rather than dump raw events;
- direction matters more than daily perfection;
- the target is reliable return, not zero drift;
- real-life commitments change what was reasonable;
- progress is evidence such as practiced, applied, reviewed, and repeated—not a
  fabricated percentage;
- long-range recall can move `month → week → day → source`;
- summaries retain provenance and never outrank the records they summarize.

## Included

- one authenticated Reviews surface for weekly and monthly periods;
- deterministic period boundaries selected in the user's local time;
- a compact source rollup from Daily Return, Calendar, Journey, Drift, and NOT NOW;
- a user-authored six-question review;
- final review before submission;
- versioned review revisions with preserved history;
- explicit links from a monthly review to weekly reviews inside that month;
- a read model that supports period navigation and Memory retrieval later;
- typed domain events for successful mutations;
- isolated PostgreSQL authority, forced RLS, and a separately revocable capability;
- synthetic responsive visual review.

## Not included

- AI-generated summaries or automatic review submission;
- scheduled/background review creation;
- notification delivery;
- scores, streaks, grades, completion percentages, productivity judgments, or mood
  diagnosis;
- automatic Memory promotion;
- automatic changes to Direction, goals, Journey activation, Calendar, NOT NOW, or
  Drift decisions;
- vector search or embeddings;
- yearly reviews;
- deleting historical revisions;
- hosted migration, grant application, deployment, or real personal data.

AI-assisted review can later propose text from this same source package, but it must
remain a visibly derived draft requiring deliberate user review. V1 first proves the
period model and user-owned compression.

## Period model

### Week

- ISO-aligned Monday through Sunday.
- Exactly seven local dates.
- Identified by `periodStart` and `periodEnd`, both inclusive.
- The browser may navigate backward and forward by seven local dates.

### Month

- First through last local date of one calendar month.
- Identified by inclusive `periodStart` and `periodEnd`.
- The browser may navigate backward and forward by calendar month.

The API validates the relationship rather than trusting a label. A `WEEK` must be an
exact Monday-to-Sunday range. A `MONTH` must be the exact first-to-last range for the
given start month. Dates are interpreted only with the supplied valid IANA time zone.

Future and excessively old periods are not silently blocked by V1. The user may
review a historical period, and an empty period remains truthful. The read query is
bounded to one validated week or month.

## Source rollup

The period overview is assembled by trusted application code. It does not invent
meaning, infer success, or ask a model to choose what mattered.

### Daily Return

- current Daily Return reviews inside the date range;
- append-only Daily Log entries inside the date range;
- counts by explicit return state;
- excerpts remain labeled `REFLECTION`.

### Calendar

- confirmed events overlapping the period's explicit UTC boundary;
- events grouped by existing category and commitment level;
- duration is shown only as factual scheduled time;
- no comparison to a target and no “utilization” score.

### Journey

- the current activation if it overlaps the period;
- completed practice sessions inside the period;
- factual practice duration and technique labels;
- user-authored session reflections stay `REFLECTION`;
- no mastery or capability percentage.

### Drift

- Drift occurrences recorded inside the period;
- explicit current understanding and return posture;
- no inferred emotional or diagnostic pattern;
- no success/failure judgment based on occurrence count.

### NOT NOW

- items created or explicitly reviewed inside the period;
- current posture is a `DECISION` about containment, not a new commitment;
- repeated ideas are visible for deliberate reconsideration but remain NOT NOW.

### Weekly sources in a monthly review

A monthly overview includes current weekly-review revisions whose ranges fall inside
the month. They appear as `REFLECTION` summaries with links to their exact week.
Monthly text never hides or deletes the weekly source.

## Review prompts

The same durable structure serves both period kinds:

1. **What actually mattered in this period?**
2. **What meaningfully changed?**
3. **What moved forward—and what evidence supports that?**
4. **Where did I drift, return, or keep returning?**
5. **What did I learn?**
6. **What do I choose to carry forward?**

An optional seventh field asks:

**What may be worth preserving later?**

That field is a Memory candidate only. Submitting the review does not create or
promote canonical Memory.

Every required answer is exact user-authored text, labeled `REFLECTION`, and limited
to 4,000 characters. “Evidence” in the third question is still the user's account;
the adjacent source rollup supplies inspectable records without making the review a
system verdict.

## Persistence shape

### `periodic_review`

Versioned records:

- `periodic_review_id`
- `user_id`
- `period_kind` — `WEEK` or `MONTH`
- `period_start`
- `period_end`
- `time_zone`
- `what_mattered`
- `what_changed`
- `what_moved_forward`
- `drift_and_return`
- `what_was_learned`
- `carry_forward`
- `worth_preserving` — nullable
- `status` — `CURRENT` or `SUPERSEDED`
- `submitted_at`
- `recorded_at`
- `ended_at` — nullable
- `supersedes_review_id` — nullable
- `request_id`
- `request_fingerprint`

Only one current revision exists per user, period kind, and period start. Revising a
review inserts a new row, marks the previous row superseded, and retains the complete
earlier reflection.

The persisted review does not duplicate Calendar events, Daily Return text, Journey
sessions, Drift records, or NOT NOW items. Its response read model reconstructs the
source rollup from the owning domains.

## Authority and provenance

| Information | Authority | Owner |
| --- | --- | --- |
| periodic review answers | `REFLECTION` | Reviews |
| period boundaries and record timestamps | `FACT` | Reviews |
| Calendar events | `FACT` | Calendar |
| Journey activation | `DECISION` | Journey |
| Journey practice occurrence/duration | `FACT` | Journey |
| Daily/weekly/monthly review text | `REFLECTION` | Reviews |
| Drift note | `USER_SOURCE` | Drift |
| Drift understanding / return posture | `DECISION` | Drift |
| NOT NOW posture | `DECISION` | NOT NOW |
| worth-preserving field | `REFLECTION` / candidate only | Reviews |

Recency does not change these labels. A monthly review cannot supersede a Direction
decision merely because it is newer.

## Domain events

Successful mutations write canonical review state and one event in the same
transaction:

- `PERIODIC_REVIEW_SUBMITTED`
- `PERIODIC_REVIEW_REVISED`

Event payload contains the review identity, kind, range, status, and supersession
identity when present. Raw review text is not copied into the event or technical
telemetry.

## Private API

Behind `LIFE_OS_PERIODIC_REVIEWS_ENABLED=true`:

- `GET /api/v1/reviews/period?kind=WEEK&periodStart=YYYY-MM-DD&timeZone=...&calendarFrom=...&calendarTo=...`
- `PUT /api/v1/reviews/period`

The GET response contains:

- the validated period identity;
- the current review revision, when one exists;
- the bounded, typed source rollup;
- adjacent period navigation dates;
- weekly review summaries for a monthly period.

The PUT request contains the exact period identity, review answers, optional expected
current review ID, `submittedAt`, and an idempotency key header.

Malformed ranges, invalid zones/instants, unknown keys, blank required fields,
oversized text, stale expected revisions, and cross-user identities are refused.
Exact request replay returns the original revision. Reusing the idempotency key with
different content returns a conflict.

## Database capability

- PostgreSQL remains canonical.
- `periodic_review` has enabled and forced RLS.
- policies are scoped to the authenticated user ID.
- the migration/owner identity does not run the application.
- the baseline application role receives no authority from the migration.
- a separate capability grant allows only required sequence, SELECT, INSERT, and
  UPDATE privileges; no DELETE, TRUNCATE, REFERENCES, or TRIGGER privilege.
- capability revocation makes the feature unavailable without breaking the baseline
  private API.
- readiness verifies table existence, forced RLS, non-owner identity, scoped grants,
  and zero rows from an unscoped read.

## UI

The authenticated `/reviews` surface opens on the current week and provides:

- Week / Month choice;
- previous, current, and next period navigation;
- a calm “what Life OS can show” source overview;
- progressive disclosure into exact daily/source records;
- the six review prompts and optional preservation candidate;
- explicit `REFLECTION` labels;
- final review before commit;
- revision history disclosure when an earlier revision exists;
- a clear statement that no source domain or Memory changed.

The user can read an empty period and submit a review if they choose. The UI must not
manufacture activity to make the period feel complete.

The surface is linked from Today and remains cross-cutting rather than replacing the
five durable V1 destinations.

## Failure behavior

| Condition | Response |
| --- | --- |
| missing/invalid session | `401 authentication_required` |
| feature not composed | route is `404` |
| invalid period/request | `400 invalid_request` |
| stale revision | `409 current_review_changed` |
| idempotency mismatch | `409 idempotency_conflict` |
| database capability unavailable | `503 periodic_reviews_unavailable` |
| unexpected failure | `500 internal_error` |

No failure fabricates a summary or writes partial state.

## Acceptance criteria

1. Week and month ranges are validated by calendar meaning, not only string shape.
2. A verified user can read only their RLS-scoped period sources and reviews.
3. The overview preserves each source domain's authority and provenance.
4. A review contains no score, streak, grade, or generated judgment.
5. Exact retries do not duplicate a revision.
6. A revision supersedes rather than destroys its predecessor.
7. Stale revision writes are refused.
8. Each successful mutation emits exactly one typed domain event transactionally.
9. Submitting a review does not change Direction, Journey, Calendar, Memory, NOT NOW,
   or Drift.
10. A monthly overview can reference current weekly reviews without copying their
    source text into canonical facts.
11. Baseline application authority remains unchanged until the separate grant is
    deliberately applied.
12. Revocation removes the capability cleanly.
13. The live route is authentication-gated and contains no sample personal state.
14. Synthetic visual review remains usable at phone, tablet, and desktop widths.
15. CI typechecks, runs real PostgreSQL isolation tests, behavior checks, and hosted
    web build.

## Safety boundary for this slice

- synthetic development data only;
- no hosted migration or capability grant application;
- no production flag activation;
- no real personal content;
- no deployment;
- no merge;
- the pull request remains draft through verification.
