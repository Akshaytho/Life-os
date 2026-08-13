# Life OS — Return System Design V1

**Canonical artifact:** `LIFE-OS-CANON-001` v1.2.0  
**Product baseline:** `docs/product/PRD.md`  
**Domain baseline:** `docs/architecture/DOMAIN_MODEL.md`  
**Classification:** ALIGNED + REFINEMENT  
**Status:** synthetic/read-only visual slice

## Product question

**What is pulling me away, and what do I want to do with it?**

The Return System helps the user preserve choice when inspiration, comparison, emotion, avoidance or a genuinely better possibility pulls attention away from current direction.

The target is not zero drift. The target is a reliable, shame-free return or a deliberate reconsideration.

## Ownership boundary

The Return System owns:

- raw Brain Dump / drift source capture;
- derived drift classification;
- temporary idea parking / NOT NOW context;
- explicit response to the drift event;
- return/reconsideration provenance.

It does not silently own or rewrite:

- current direction / major decisions → You;
- active capability → Journey;
- dated commitments → Calendar;
- today's plan → Today;
- long-term recall/patterns → Memory.

## Authority chain

```text
YOU SAID / FELT / NOTICED     USER SOURCE
            ↓
LIFE OS INTERPRETS            OBSERVATION
            ↓
LIFE OS OFFERS RESPONSES      SUGGESTION
            ↓
YOU CHOOSE                    DECISION
            ↓
optional later proposal       SUGGESTION / REVIEW
            ↓
explicit high-authority change only if separately approved
```

A drift classification is never a diagnosis or durable truth about the user.

## Four response modes

### Continue

Return to the currently chosen direction/plan. The drift source may remain in history, but it does not create a new project or capability.

### Park

Preserve the idea as `NOT NOW` so it can be revisited deliberately without competing for current attention.

Parking an idea does not activate a Journey, goal or Calendar commitment.

### Explore

Allow a bounded low-authority experiment or question without treating it as a new direction.

A future Explore flow may create a time-boxed experiment, but that is separate from V1.

### Reconsider

Open a deliberate review of the current direction/decision.

Reconsideration does not itself supersede an active decision. It creates a review/proposal boundary; an explicit user decision is still required for high-authority change.

## Drift understanding

Initial interpretation labels may include:

- temporary inspiration;
- comparison;
- avoidance;
- emotional reaction;
- genuine reconsideration;
- unclear / needs reflection.

These are `OBSERVATION` labels with provenance, not facts.

Multiple labels may coexist. Example: a new idea may be both inspiration and comparison.

The UI must not pretend that Life OS knows motive with certainty.

## Top-level flow

### 1. Raw source

Show the user's exact drift statement first. Preserve it before classification.

### 2. What Life OS notices

Show one or more lower-authority observations and why they were suggested.

No giant confidence score.

### 3. What stays true right now

Show a compact reference to the active direction/capability/plan that would otherwise be displaced.

This is a reference to canonical owners, not a duplicate source of truth.

### 4. Choose a response

Continue / Park / Explore / Reconsider are visually distinct and explained by consequence.

V1 controls are disabled/read-only. A sample may show which response would be selected, but nothing is persisted.

### 5. Return point

If Continue/Park is selected, make the next concrete return point visible:

- current capability;
- next experiment;
- next real commitment;
- or simply today's remaining plan.

The Return System should help resume, not punish interruption.

## NOT NOW

NOT NOW is a protected parking state, not an idea graveyard and not a queue demanding completion.

Lifecycle baseline:

`CAPTURED → CLASSIFIED → NOT_NOW → UNDER_REVIEW → PROMOTED or DISMISSED`

Repeatedly returning ideas may be surfaced for deliberate review later, but repetition alone does not promote them.

## Relationship to Memory

Memory may later retrieve drift episodes or identify repeated patterns. Those patterns remain derived and cannot silently become direction changes.

## Relationship to Interaction & Change Ledger

When Return actions become persisted, the user-visible ledger should be able to explain:

- raw drift source;
- observation/classification;
- suggested response;
- user's response;
- whether anything canonical changed.

A Continue/Park action may be meaningful history even when no high-authority life state changes.

## Emotional / safety boundary

Life OS may record the user's own description of mood or emotion, but derived interpretation is non-diagnostic.

The Return System must avoid shame language, productivity punishment, or claims about psychological cause.

## Visual metaphor

**A stabilizer / fork in the road.**

Use the Life Instrument language:

- warm operating canvas;
- dark-ocean source/current-direction instrument;
- coral for the active choice boundary;
- quiet gold for parked/exploratory possibilities;
- mono authority/provenance labels;
- clear spatial separation between current truth and possible alternatives.

Avoid:

- warning/alarm aesthetics;
- red failure states;
- motivational coach language;
- gamified streak recovery;
- giant four-card SaaS chooser;
- personality labels.

## Mobile hierarchy

The first phone viewport should establish:

1. `RETURN / DRIFT`;
2. exact source;
3. `NOTHING CHANGED YET` boundary;
4. what remains active now;
5. beginning of Life OS observations.

The four response modes may follow below the first fold; no active control should be hidden behind the dock.

## Desktop hierarchy

Use width to make the fork readable:

- source/current truth on the left/upper field;
- observations as a quieter interpretation rail;
- response modes as a consequence matrix below;
- return point clearly visible after the choice.

## V1 sample

Synthetic source:

> I saw another creator using amazing camera movement and now I want to stop Sound Design and switch immediately.

Synthetic observations:

- temporary inspiration may be present;
- comparison may be amplifying urgency;
- no explicit decision to change capability exists.

Current truth reference:

- Journey owner → Sound Design remains ACTIVE.

Suggested response shown in sample:

- `PARK` the Camera Movement idea in NOT NOW;
- return to the current Sound Design experiment.

This is synthetic UI data and must not be treated as a real user statement or Product Doctrine rule.

## V1 interaction boundary

Read-only/sample only:

- no persisted Brain Dump;
- no drift event write;
- no NOT NOW creation;
- no Journey/Direction mutation;
- no AI call;
- no real personal data.

## Acceptance checks

- The user can see that drift is allowed without becoming direction change.
- Exact source is visibly separate from Life OS interpretation.
- Current canonical state remains visually higher authority than the new impulse.
- Continue / Park / Explore / Reconsider explain consequences rather than merely naming buttons.
- Reconsider does not look equivalent to changing direction.
- No diagnosis, shame, streak or failure score appears.
- The sample makes returning concrete.
- The Return System remains contextual, not a sixth permanent navigation destination.
- 390 / 430 / 768 / 1440 real browser renders are inspected before merge.

## Canonical comparison

- **ALIGNED:** Brain Dump preserves raw input before classification.
- **ALIGNED:** drift classifications are derived understanding, not canonical truth.
- **ALIGNED:** NOT NOW protects current focus without deleting ideas.
- **ALIGNED:** explicit decision is required before Journey/Direction promotion.
- **ALIGNED:** target is reliable return rather than zero drift.
- **ALIGNED:** derived emotional interpretation remains non-diagnostic.
- **REFINEMENT:** defines Continue / Park / Explore / Reconsider as the user-facing response vocabulary over the existing Return System lifecycle.
- **NO CONFLICT:** Today, Journey, Calendar, Memory, You and Interaction Ledger ownership stays unchanged.
