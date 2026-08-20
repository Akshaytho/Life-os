# Life OS — Daily Logging & Return Review V1

**Status:** Implementation specification  
**Canonical comparison:** `LIFE-OS-CANON-001 v1.2.0`  
**Change class:** ALIGNED refinement of Today and Reviews

## Product question

**What happened today, what moved, what pulled me away, and what do I return to tomorrow?**

This slice helps the user remember the day and return to chosen direction without turning the day into a scorecard.

## Canonical alignment

This slice implements:

- Today as orientation around the life the user actually had
- daily review as reflection rather than productivity scoring
- returning after drift as more important than perfection
- exact user-authored words preserved with provenance
- canonical state plus append-only domain events
- explicit domain boundaries: reflection never silently changes Direction, Journey, Calendar, Memory, or NOT NOW

It does not change product doctrine.

## V1 workflow

### During the day

The user may append a short daily log entry.

A log entry is:

- exact user-authored text
- labeled `REFLECTION`
- append-only in V1
- attached to the user's local date and recorded time
- never AI-classified or routed by this slice
- never treated as proof that a task, Journey step, or Calendar event happened

### End of day

The review asks the four agreed questions:

1. **What happened today?**
2. **What moved forward?**
3. **What pulled me away?**
4. **What do I return to tomorrow?**

It also asks:

**Did you return to your direction after drifting?**

The allowed return states are:

- `RETURNED` — the user says they returned
- `STILL_RETURNING` — the user says the return is still in progress
- `NO_DRIFT_NOTICED` — the user did not notice drift that day

The review has no percentage, streak, grade, success/failure badge, or generated judgment.

## Authority and trust

| Information | Authority class | Meaning |
| --- | --- | --- |
| Daily log text | `REFLECTION` | What the user chose to record during the day |
| Review answers | `REFLECTION` | The user's account of the day |
| Return state | `REFLECTION` | The user's explicit answer, not a detector result |
| Review/log timestamps | `FACT` | When Life OS recorded the user action |
| Domain events | `FACT` | That a log or review mutation occurred |

V1 does not ask AI to infer whether drift occurred. The later Drift workflow owns structured trigger/emotion/distraction analysis.

## Persistence shape

### `daily_log_entry`

Append-only records:

- `daily_log_entry_id`
- `user_id`
- `local_date`
- `time_zone`
- `body`
- `occurred_at`
- `recorded_at`
- `request_id`
- `request_fingerprint`

An exact idempotent retry returns the original entry. Reusing a request ID with different content is rejected.

### `daily_return_review`

Versioned records:

- `daily_return_review_id`
- `user_id`
- `local_date`
- `time_zone`
- `what_happened`
- `what_moved_forward`
- `what_pulled_me_away`
- `return_to_tomorrow`
- `return_state`
- `status` — `CURRENT` or `SUPERSEDED`
- `submitted_at`
- `recorded_at`
- `ended_at`
- `supersedes_review_id`
- `request_id`
- `request_fingerprint`

Only one review revision may be current for a user and local date. Editing creates a new revision and preserves the earlier one.

## Domain events

Meaningful mutations write canonical state and a domain event in the same transaction:

- `DAILY_LOG_ENTRY_RECORDED`
- `DAILY_RETURN_REVIEW_SUBMITTED`
- `DAILY_RETURN_REVIEW_REVISED`

The actor is `USER`. Correlation and request IDs remain inspectable. Raw reflection text is not duplicated into technical telemetry.

## Private API boundary

The slice exposes authenticated, user-scoped operations behind a separate runtime capability:

- read one local date's log entries and current review
- append one log entry
- submit or revise one review

Writes require an idempotency key. The API rejects malformed dates, invalid return states, blank required content, oversized content, stale review revisions, and cross-user access.

## Database boundary

- PostgreSQL is canonical.
- Both tables use enabled and forced RLS.
- Policies are scoped to the authenticated user ID.
- The baseline application role has no Daily Return authority.
- A separate capability grant allows only the minimum read/write privileges.
- No delete, truncate, references, or trigger privilege is granted.
- Revocation returns the runtime to Daily Return unavailable without breaking the baseline API.

## Today UI

The live Today surface gains a calm, mobile-first Daily Log / Evening Return area:

- chronological log entries for the selected local date
- one short append field
- the four agreed review prompts
- the return-after-drift choice
- explicit `REFLECTION` labels
- a final review step before submission
- clear empty and unavailable states
- no hidden writes

The interface does not invent Current Direction, Journey progress, or Memory retention when those reads are unavailable.

## Explicitly deferred

- Drift trigger/emotion/distraction classification
- Brain Dump routing and NOT NOW
- AI summaries, recommendations, or automatic preservation
- weekly/monthly consolidation
- Memory promotion
- editing or deleting individual log entries
- notifications
- hosted migration, grants, feature flags, deployment, or real personal data

## Acceptance criteria

1. A user can append a reflection and exact retries do not duplicate it.
2. Another user cannot read or write the entry through PostgreSQL RLS.
3. A user can submit the agreed end-of-day review without a score.
4. A revision supersedes rather than destroys the previous review.
5. Stale review updates are refused.
6. Each successful mutation emits exactly one typed domain event transactionally.
7. Baseline application authority remains unchanged until the separate capability grant is applied.
8. Revocation removes Daily Return capability cleanly.
9. Today is usable at phone, tablet, and desktop widths.
10. No hosted state, production secret, or real personal content is required for verification.
