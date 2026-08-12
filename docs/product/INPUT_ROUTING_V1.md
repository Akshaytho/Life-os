# Life OS — Conversational Input & Routing V1

**Canonical artifact reviewed:** `LIFE-OS-CANON-001` v1.1.0  
**Change classification:** EXTENSION + REFINEMENT  
**Status:** implementation contract for the first Capture / routing slice

## Product question

How can the user speak naturally to Life OS without manually choosing database categories, while keeping canonical state trustworthy and preventing AI interpretation from silently becoming fact or decision?

## Core rule

Natural-language interpretation may be intelligent. Canonical authority changes may not be silent.

The permanent routing pipeline is:

```text
CAPTURE
  raw user expression
      ↓
INTERPRET
  entities, time, certainty, intent, references
      ↓
ROUTE
  choose one or more owning Life OS domains
      ↓
PROPOSE
  describe structured effects without applying them
      ↓
CONFIRM
  user reviews ambiguity / high-authority changes
      ↓
COMMIT
  canonical mutation + domain event, transactionally
```

In V1 only Capture → Interpret → Route → Propose is implemented as a sample/read-only product slice. No canonical writes occur.

## Why this is not a chat screen

Capture is a cross-cutting input surface. It should feel like a private command/capture instrument, not a permanent AI-chat destination.

The user's sentence remains the source. Life OS AI produces an interpretation of it. The interpretation is not automatically authoritative.

Examples:

- `My friend may visit Saturday evening` → Calendar candidate, certainty tentative, confirmation required before commitment.
- `Yes, Sep 12–16 is decided` → Travel/Calendar proposal plus decision semantics; user must approve the structured change.
- `I learned why room tone matters` → Journey learning-evidence candidate. The user statement is the source; AI-derived wording remains interpretation.
- `I want to become a filmmaker now` → reflection / reconsideration candidate; never silently replaces an active Journey.
- `My shoulder felt uncomfortable today` → user-reported health observation; never an AI diagnosis.
- `I am drifting` → Drift flow entry; does not create a new goal.

## Routing ownership

Capture itself owns no durable life truth. It forwards proposed consequences to owners.

Initial destinations:

- `TODAY` — same-day focus/context consequence
- `CALENDAR` — dated reality/plans
- `JOURNEY` — deliberate capability learning/evidence
- `MEMORY` — retrievable fact/reflection/history candidate
- `YOU` — durable direction/decision/reconsideration candidate
- `BRAIN_DUMP` — raw thought requiring later classification
- `DRIFT` — return/reconsideration flow
- `NOT_NOW` — preserve possibility without commitment

One input can produce multiple proposals when ownership is genuinely split. Example: a sound-practice session can create a Calendar time window while Journey owns the learning/evidence.

## Interpretation contract

An interpretation contains:

- original user text
- detected intent kind
- temporal expressions, if any
- certainty signal
- extracted entities / subjects
- observations made by the interpreter
- proposed effects
- clarification questions
- interpretation confidence
- source actor

Confidence is about interpretation quality. It never raises authority.

## Proposal contract

Every proposed effect contains:

- destination
- operation kind
- concise user-visible summary
- target trust class if eventually committed
- approval mode
- proposal state
- provenance summary
- optional structured preview fields

### Proposal state

- `PROPOSED` — interpretation produced a possible effect; nothing written.
- `NEEDS_CONFIRMATION` — ambiguity or authority requires an explicit user answer.
- `READY_TO_APPLY` — enough information exists, but the user still performs the apply action.
- `REJECTED` — user declined the proposal.
- `APPLIED` — future persisted state after successful canonical mutation + event.

V1 never enters `APPLIED`.

### Approval modes

- `REVIEW_AND_APPLY` — ordinary low-risk structured write; user sees the effect and presses Apply.
- `EXPLICIT_CONFIRMATION` — ambiguity or meaningful commitment requires a direct confirmation step.
- `HIGH_AUTHORITY_APPROVAL` — direction, active Journey/capability, major decision supersession, destructive memory change, or equivalent high-authority mutation.

No AI-generated proposal bypasses an Apply/Confirm boundary.

## Trust semantics

The UI must distinguish:

- the **user input** as source material
- **AI / parser observations** as OBSERVATION
- **proposed consequences** as SUGGESTION / PROPOSED
- eventual user-confirmed state as FACT / REFLECTION / DECISION according to the domain

A destination suggestion is not proof that the underlying statement is factually true.

## Ambiguity rules

Prefer asking one narrow question over inventing detail.

Examples:

- Missing date/time for a dated plan → ask for the missing time boundary.
- `maybe`, `might`, `thinking about` → preserve tentative certainty.
- relative time (`tomorrow`, `Saturday`) → resolve only when locale/timezone context is available and keep the original phrase in provenance.
- conflicting candidate owners → show both proposals rather than silently collapsing ownership.
- health language → preserve user-reported symptom/observation; never infer diagnosis.
- new identity/direction language → treat as reflection/reconsideration unless user explicitly finalizes a new decision.

## Apply semantics for future persistence

When persistence is added:

1. User presses Apply/Confirm.
2. Backend revalidates proposal against current state.
3. Canonical mutation and append-only domain event are written transactionally.
4. Event actor reflects who made the authoritative action. A user-confirmed proposal is authoritative because of the user's confirmation, not because AI suggested it.
5. Correlation/causation connect the original capture, interpretation and applied mutation.
6. UI returns the committed result with provenance.

## AI unavailable mode

Life OS remains useful without AI.

Capture can always store or locally hold raw text as a Brain Dump candidate. Known structured controls can still create Calendar/Journey/etc. entries manually in later slices. AI is an interpretation accelerator, not a dependency for owning the user's data.

## V1 UI design

The first interface is a mobile-first **Capture instrument**:

1. large plain-language input field
2. small sample prompts for testing different semantics
3. `Preview routing` action
4. visible interpretation strip: intent / certainty / confidence
5. one or more destination proposals
6. clear `Nothing has been written` boundary
7. clarification prompt when needed
8. source/provenance disclosure

The screen should not resemble a chat transcript. It is a command surface with one active input and a structured consequence preview.

## Data-shape requirements

The UI must handle:

- zero proposals
- one proposal
- several proposals
- long user text
- long proposal summaries
- uncertain / confirmed language
- missing temporal detail
- high-authority reconsideration
- multiple owning domains
- unknown text that safely falls back to Brain Dump

## V1 prototype interpreter

For this branch, interpretation is intentionally deterministic and local. It exists only to exercise the routing contract and UI. It must be visibly labelled as sample/local logic and must not be presented as production AI behavior.

Unknown inputs safely produce a Brain Dump proposal rather than pretending to understand them.

## Pre-build comparison against canonical artifact

- **ALIGNED:** natural language may be routed intelligently.
- **ALIGNED:** Calendar owns dated plans; Journey owns learning/evidence; You owns durable direction/major decisions.
- **ALIGNED:** raw conversation/input is not canonical truth.
- **ALIGNED:** AI interpretations remain observations/suggestions.
- **ALIGNED:** important AI-generated changes require proposals/approvals.
- **ALIGNED:** provenance remains inspectable.
- **ALIGNED:** core capture remains useful without AI.
- **REFINEMENT:** defines explicit proposal states and approval modes.
- **EXTENSION:** introduces a first-class Capture routing contract and `/capture` product surface.
- **NO CONFLICT:** no new AI authority, persistence, autonomous planning, or hidden writes are introduced.
