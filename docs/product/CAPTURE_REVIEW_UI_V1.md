# Life OS — Capture Review UI V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Change classification:** ALIGNED + REFINEMENT  
**Status:** visual/read-only prototype using sample data

## Product question

**Before anything changes, do these proposed consequences match what I meant?**

Capture Review is not primarily a routing debugger. It is the user's trust surface between natural language and future canonical change.

## Hierarchy

The screen should read in this order:

1. **Capture instrument** — say it naturally; this remains editable sample input.
2. **Review lock** — unmistakable statement that there are zero canonical writes.
3. **Your words** — user-authored source, visually highest authority on the review surface.
4. **Life OS observation** — compact interpretation, visibly labeled OBSERVATION and lower authority than source.
5. **Needs you** — clarification only when uncertainty/detail is missing.
6. **Proposed consequences** — one row/instrument per domain consequence, each visibly a SUGGESTION now.
7. **If approved** — proposed result class shown separately from current proposal authority.
8. **No-write boundary** — Confirm/Apply remain unavailable until real persistence/auth/authorization wiring exists.

The six-stage Capture → Interpret → Route → Propose → Confirm → Commit lifecycle may remain as secondary orientation, but it must not dominate the first viewport.

## Trust representation

Use explicit language rather than relying on color alone:

- `YOU SAID · USER SOURCE`
- `LIFE OS SAW · OBSERVATION`
- `LIFE OS PROPOSES · SUGGESTION`
- `IF APPROVED → FACT / DECISION / REFLECTION / ...`

A proposal targeting FACT or DECISION must never visually look like a current fact/decision before approval.

Confidence belongs to interpretation only. It is secondary metadata, not a score and not an authority meter.

## Visual metaphor

**Review table / evidence ledger inside the existing Life Instrument world.**

Keep:

- warm neutral operating canvas
- deep-ocean Capture instrument
- coral active signal
- monospaced provenance labels
- strong sans typography
- open editorial spacing

Avoid:

- generic dashboard cards
- excessive pills/badges
- stepper-first UX
- a developer-console feeling
- equal visual weight for source, observation, and proposal
- giant AI confidence percentages

## Mobile composition

The first phone viewport should establish:

- Life OS / private sample state
- Capture Review purpose
- editable dark Capture instrument
- zero-write/review lock

Immediately below, source and observation form one readable review ledger. Proposed consequences follow without forcing the user through a large diagnostic preamble.

Proposal rows should stack vertically and preserve comfortable touch/reading targets. Metadata can compress into two-column rows where necessary.

## Desktop composition

Use width to create a review workspace rather than a narrow mobile column centered on a large page.

Suggested structure:

- hero + Capture instrument as an upper working field
- source/observation ledger in a two-column relationship where meaning remains clear
- proposal consequences as wide horizontal instruments
- lifecycle and provenance as supporting rails

## Interaction boundary

This remains sample/read-only behavior:

- textarea + examples can recompute local sample interpretation
- no persisted Capture is created
- no real proposal-review API is called
- Confirm/Apply stay disabled
- no canonical state changes

The UI should say this plainly without making the whole page feel like a developer prototype.

## Acceptance checks

- In 5 seconds, a user can answer: what did I say, what did Life OS infer, what is it proposing, and has anything changed?
- Source / observation / suggestion cannot be mistaken for one another.
- `IF APPROVED` class is visually distinct from proposal's current `SUGGESTION` class.
- Clarification is prominent only when present.
- Confidence is visibly secondary.
- Mobile bottom navigation does not obscure important review content.
- 390, 430, 768, and 1440 layouts are inspected from real browser renders.
- Existing Today/Journey/Calendar regressions remain visually stable.

## Canonical comparison

- **ALIGNED:** Capture remains raw source before classification.
- **ALIGNED:** interpretation remains OBSERVATION.
- **ALIGNED:** proposals remain SUGGESTION until approval.
- **ALIGNED:** proposed result class is not current authority.
- **ALIGNED:** provenance remains inspectable.
- **ALIGNED:** short UI / deep data uses progressive disclosure.
- **REFINEMENT:** routing mechanics move to secondary visual importance while review meaning becomes primary.
- **NO CONFLICT:** no navigation ownership, persistence behavior, AI authority, or approval rule changes.
