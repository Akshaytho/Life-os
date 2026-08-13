# Life OS — Daily Review Design V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Product baseline:** `docs/product/PRD.md`  
**Memory baseline:** `docs/architecture/MEMORY.md`  
**Classification:** ALIGNED + REFINEMENT  
**Status:** synthetic/read-only visual slice

## Product question

**What mattered today, what changed, and what is worth carrying forward?**

Daily Review is a compression surface. It is not a scorecard, habit streak, productivity grade, guilt ritual, or AI-authored verdict on the day.

The review helps turn a dense day into a small amount of trustworthy context that weekly/monthly Memory can later retrieve.

## Ownership boundary

Daily Review owns:

- the user’s end-of-day reflection;
- a compact summary of what actually happened;
- selected learning/evidence worth preserving;
- explanation of why planned items changed or did not happen;
- a return-from-drift reflection when relevant;
- proposals for what may be worth carrying into Memory or another owner.

It does not replace:

- Calendar’s actual time/commitments;
- Today’s operational plan;
- Journey’s capability evidence;
- Memory’s long-range retrieval/history;
- You’s high-authority direction/major decisions;
- Interaction Ledger’s explanation of Life OS-driven changes.

## Authority model

A review mixes several authority classes and must keep them visible:

- Calendar/Today/Journey facts → `FACT` / current owner reference;
- the user’s review text → `REFLECTION`;
- Life OS pattern/summary suggestions → `OBSERVATION` or `SUGGESTION`;
- “preserve this” or “change direction” remains a proposal until explicitly approved.

AI must never convert a review sentence directly into an active decision or canonical memory without the required approval boundary.

## Durable Daily Review hierarchy

### 1. Reality of the day

Begin with what actually happened, not what was originally hoped for.

Show a compact reality strip such as:

- fixed work reality;
- important health/family/social commitments;
- creator/learning evidence that actually occurred;
- meaningful open/rest time.

No “completion percentage.”

### 2. What mattered

A short user-owned reflection answering:

- what mattered most today?
- what moved forward?
- what was legitimate life even if it was not creator/work progress?

The UI should permit one or a few concise reflection blocks rather than a questionnaire wall.

### 3. What changed / why

If something planned did not happen, preserve context instead of turning it into failure.

Examples of reason shapes:

- fixed work expanded;
- family/friends/health took intentional priority;
- energy was lower than expected;
- the plan was unrealistic;
- attention drifted and later returned;
- task no longer mattered.

These may be user explanations or Life OS observations, but must remain distinguishable.

### 4. Evidence / learning

Select only evidence that matters to an owning domain.

Examples:

- Journey practice applied to a reel;
- a learning worth retaining;
- a useful experiment outcome;
- a return action after drift.

Review references the evidence; Journey remains its canonical owner.

### 5. Worth preserving

End with a small set of preserve candidates:

- learning → Memory candidate;
- reflection → Memory candidate;
- important person context → Memory candidate;
- explicit major decision → You proposal/review, not automatic activation;
- future dated commitment → Calendar proposal/review.

V1 shows the candidates and authority boundary but keeps all actions disabled/read-only.

### 6. Close the day

A closing state should feel like compression, not judgment.

Example:

> Day understood. Nothing needs to be made perfect before tomorrow.

This is orientation, not motivational scoring.

## Time compression relationship

Daily Review becomes a primary source for later compression:

```text
raw events + owner evidence
          ↓
      DAILY REVIEW
          ↓
      weekly summary
          ↓
      monthly summary
          ↓
     long-range Memory
```

Weekly/monthly summaries remain derived. The original daily review and source evidence stay inspectable.

## Return System relationship

If drift occurred, Daily Review may record:

- what pulled attention away;
- whether the user returned;
- what response helped;
- whether anything is worth preserving.

The review must not shame drift or infer a psychological diagnosis.

## Visual metaphor

**Closing the editing timeline / making a daily cut.**

Use the Life Instrument language:

- warm canvas;
- dark-ocean day-summary instrument;
- owner facts as quiet structural data;
- user reflection given strong readable space;
- coral only for explicit preserve/review attention;
- lower-authority AI notes visually quieter;
- progressive disclosure for provenance.

Avoid:

- rings/percentages;
- red failed tasks;
- habit streaks;
- “productive/unproductive” labels;
- giant form controls;
- dashboard KPI cards.

## Mobile hierarchy

The first phone viewport should establish:

1. `DAILY REVIEW`;
2. the date / close-day context;
3. reality summary;
4. first user reflection.

No live preserve/commit control may sit under the fixed dock.

## Desktop hierarchy

Use width to relate the day’s reality and reflection without becoming a multi-column enterprise form.

Evidence and preserve candidates can appear in secondary rails below the main reflection.

## V1 sample

Synthetic day:

- fixed software work occupied most of the day;
- gym happened;
- one Sound Design experiment moved forward;
- an open evening remained partly open;
- one planned creator action moved to another day without being treated as failure.

Synthetic reflection:

> Work took the space it needed. Training happened. The sound experiment became clearer because I kept it small instead of trying to finish everything.

Synthetic learning candidate:

> Smaller applied experiments were easier to review than broad practice sessions.

All sample content demonstrates structure only and is not real user history.

## V1 interaction boundary

Read-only/sample only:

- no daily_review persistence;
- no Memory promotion;
- no Journey mutation;
- no Calendar mutation;
- no high-authority decision write;
- no AI call;
- no real personal data.

## Acceptance checks

- The day is understandable without a score or percentage.
- Intentional work/family/social/health/rest is not visually framed as failure.
- User reflection is clearly distinct from Life OS observation/suggestion.
- Journey evidence is referenced without duplicating ownership.
- Preserve candidates do not look already committed.
- The review clearly feeds later weekly/monthly compression.
- The screen feels like closing/compressing the day, not grading it.
- 390 / 430 / 768 / 1440 real browser renders are inspected before merge.

## Canonical comparison

- **ALIGNED:** review focuses on what mattered, what moved, what did not and why, learning, return and preservation.
- **ALIGNED:** no invented completion percentage or shame metric.
- **ALIGNED:** real-life commitments can explain changed expectations without being failure.
- **ALIGNED:** review summaries are derived compression, not authority over source evidence.
- **ALIGNED:** Memory promotion and high-authority changes still require explicit boundaries.
- **REFINEMENT:** defines Daily Review as the primary day→week compression surface.
- **NO CONFLICT:** Today, Calendar, Journey, Memory, You, Return System and Interaction Ledger ownership remains unchanged.
