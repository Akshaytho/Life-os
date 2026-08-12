# Life OS — Journey Design V1

## Product question

Journey answers one question:

> What am I becoming capable of, and what evidence proves it?

It is not a course dashboard, habit tracker, achievement page, portfolio, or completion meter.

The screen represents deliberate capability growth over time while protecting the user from compulsive skill switching.

## Current journey

The initial journey is **Travel Creator**.

The active phase is **01 / Sound Design**.

Future phases remain visible as route waypoints but are intentionally quiet/locked until activated through an explicit decision.

Initial route direction:

1. Sound Design — ACTIVE
2. Editing Rhythm — FUTURE
3. Framing & Composition — FUTURE
4. Camera Movement — FUTURE
5. Story Direction — FUTURE
6. Solo Production System — FUTURE

The exact future phase list can evolve later. Future labels are orientation, not commitments.

## Information hierarchy

### 1. Journey heading

Immediately establish:

- Travel Creator
- active phase
- why this journey exists
- explicit decision provenance

The user should understand the current capability direction within three seconds.

### 2. Route instrument

Represent the journey as a route through capability waypoints.

Rules:

- active waypoint dominates visually
- past/completed phases become evidence/history, not trophies
- future phases are visible but low contrast
- no completion percentage
- no progress ring
- no motivational streaks

The route communicates sequence and focus protection, not distance-to-finish.

### 3. Active capability instrument

Sound Design receives a dedicated dark immersive instrument surface consistent with Today V3.

Show:

- current technique
- current experiment intention
- evidence state
- recent practice signal
- latest learning
- next experiment

This is the working surface of the journey.

### 4. Technique field

Techniques are represented as a capability field rather than a checklist.

Initial Sound Design techniques:

- Environmental sound — ACTIVE
- J/L cuts — AVAILABLE
- Dialogue clarity — AVAILABLE
- Music relationship — AVAILABLE
- Silence — AVAILABLE
- Sound effects — AVAILABLE
- Layering — AVAILABLE

Only one technique should be visually dominant at a time.

Selecting a technique in the future changes the active experiment; it does not silently change the entire skill phase.

### 5. Evidence depth

Evidence stages are:

Learned → Practised → Applied → Reviewed → Repeated

These stages are not mastery percentages.

A technique may accumulate multiple evidence marks at each stage. The interface should show both maturity stage and the underlying evidence count/history.

Evidence examples:

- learning captured
- practice session completed
- reel used the technique
- user reflection completed
- external reel analysis received
- technique repeated in another context

### 6. Practice chronology

Practice is represented as a small chronological film-strip / field-log sequence.

Each practice item may show:

- date
- experiment
- duration
- evidence created
- one retained learning

Chronology matters more than streaks.

### 7. Reel application

Reels are evidence that a technique survived contact with actual production.

Represent each reel as a compact media frame with:

- reel identifier/title
- techniques applied
- stage
- personal review status
- external analysis status separately

Do not conflate ChatGPT/external analysis with the user's own reflection.

### 8. Learning memory

Show a small set of retained canonical learnings from this skill.

A learning should state provenance and evidence basis where available.

Do not dump every raw note onto this screen.

### 9. Next experiment

End the working flow with one deliberate next experiment.

It should be concrete enough to perform in one practice session.

The screen should resist offering five equally prominent next actions.

## Mobile-first composition

Phone is primary.

First viewport should communicate:

- Travel Creator
- Sound Design is active
- the route continues beyond Sound
- current technique
- current evidence maturity

The user should not need to scroll before understanding the state of the journey.

After the first viewport, the screen unfolds vertically into technique field, practice chronology, reel evidence, learnings, and next experiment.

## Desktop composition

Desktop should become a wider instrument:

- route rail can sit beside the active capability surface
- technique/evidence field can use additional horizontal space
- chronology and reel evidence may form two balanced columns
- do not simply center a narrow phone page inside empty desktop space

## Visual language

Inherit Today V3:

- warm mineral canvas
- deep-ocean instrument surfaces
- signal orange only for current/active state
- restrained sea/moss/sky secondary semantics
- numeric and state metadata use mono typography
- large humanist sans for meaning
- tactile low-gloss surfaces
- fine rules and spatial diagrams instead of equal cards

Journey may lean slightly more cinematic than Today because it represents craft development.

## Trust semantics

Keep FACT / REFLECTION / OBSERVATION / SUGGESTION / DECISION distinct.

Important examples:

- active Sound Design phase = DECISION
- practice session = FACT once recorded
- retained personal learning = REFLECTION or confirmed learning depending future memory model
- external reel analysis = OBSERVATION
- proposed next technique = SUGGESTION until explicitly selected

No AI-generated observation may visually masquerade as user evidence or a user decision.

## Prototype boundary

Journey V1 remains sample-data-only.

Navigation between Today and Journey may be real because it does not mutate personal state.

The following remain disabled until persistence/domain events exist:

- start practice
- change active technique
- activate future skill
- record learning
- add reel
- accept external analysis
- modify journey direction

## Visual acceptance test

Before merge:

1. Does the first phone viewport answer what capability is active?
2. Does the route feel like focus protection rather than a gamified progress path?
3. Is Sound Design represented as craft/evidence rather than percentage completion?
4. Can evidence maturity be understood without reading every label?
5. Are future skills visible without inviting switching?
6. Is personal reflection visually separate from external analysis?
7. Does the screen feel related to Today V3 but not copied from it?
8. Does the desktop layout use width meaningfully?
9. Are touch targets and text comfortable at 390 px?
10. Would any generic dashboard card be clearer as a route, timeline, strip, field, or evidence mark? If yes, replace it.
