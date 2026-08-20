# Brain Dump + NOT NOW V1

Status: active implementation specification  
Canonical parent: `LIFE-OS-CANON-001 v1.2.0`  
Classification: ALIGNED refinement of Capture, Brain Dump, and NOT NOW

## Why this exists

Life OS exists to make it easy to return to a chosen direction after drift. New thoughts must therefore have somewhere safe to go without immediately becoming goals, projects, Calendar commitments, Journey changes, or a new Direction.

Brain Dump is the global, near-zero-friction entry point. NOT NOW is the deliberate parking lot that protects the user from impulsive switching while preserving ideas for later review.

The user remains the final decision-maker. AI may organize and suggest; it cannot promote, discard, or reinterpret a thought as canonical life state by itself.

## Existing substrate

V1 builds on the current private Capture boundary rather than creating a second raw-input system.

- The global Capture action is the Brain Dump entry point.
- `capture_record.raw_text` remains the exact, append-only user source.
- Interpretation is stored separately as OBSERVATION.
- Routing consequences remain SUGGESTION until a user decision.
- A Brain Dump or NOT NOW record references Capture provenance; it never replaces or rewrites the original text.

## Firm behavior

### Brain Dump

1. The user can open Brain Dump from the global shell with minimal navigation.
2. Save the original text before interpretation.
3. A provider/model failure cannot lose the source or block capture.
4. Classification happens after capture and is shown with its authority.
5. AI classification is a suggestion. Only a user-confirmed classification becomes the current organizational decision.
6. Classification never creates a goal, project, Calendar event, Journey step, Memory, or Direction change.
7. The raw Capture remains retained after classification, parking, dismissal, or later review.

User-facing categories:

- Goal
- Idea
- Problem
- Emotion
- Person
- Concern
- Task
- Learning
- Travel
- Content
- Career
- Diet
- NOT NOW

`Diet` is only an organizational label in this slice. It does not activate the deferred Diet domain.

### NOT NOW

NOT NOW is not a backlog of hidden commitments. It is a deliberate pause between inspiration and action.

Before parking a drift-triggered idea, Life OS asks the user which description is closest:

- Temporary inspiration
- Worth researching
- Genuine change in direction
- Emotional reaction
- Unsure

The user then chooses one explicit next posture:

- Park it
- Research it without committing
- Delay the decision

The item remains non-canonical with respect to Direction, Journey, Calendar, Today, and Memory.

## Lifecycle

```text
CAPTURED
  -> CLASSIFIED
  -> PARKED_NOT_NOW
       -> RESEARCHING
       -> DELAYED
       -> DISMISSED
       -> RELEASED_FOR_REVIEW
```

- `CAPTURED` means the raw source exists even if interpretation has not completed.
- `CLASSIFIED` means the user confirmed the organizational category.
- `PARKED_NOT_NOW` is an explicit user decision, not an AI action.
- `RESEARCHING` permits investigation but creates no commitment.
- `DELAYED` preserves the unresolved decision.
- `DISMISSED` records the user's decision without deleting provenance.
- `RELEASED_FOR_REVIEW` returns the item to deliberate review. It does not promote it into another domain.

`PROMOTED` is deliberately excluded from V1. A future promotion flow must name a real target domain, show the exact consequence, require explicit confirmation, and use that domain's own reviewed write boundary.

## Authority and event rules

| Record or action | Authority | Rule |
|---|---|---|
| Raw Brain Dump text | USER_SOURCE | Preserve exactly; never rewritten by classification |
| AI/local classification | OBSERVATION or SUGGESTION | Visible, attributable, never auto-applied |
| User-confirmed category | DECISION | Organizational only; no downstream promotion |
| NOT NOW parking posture | DECISION | Explicit user choice |
| Research note | REFLECTION | Does not become fact or commitment automatically |
| Release/dismiss decision | DECISION | Retain history and provenance |

Required domain events:

- `BRAIN_DUMP_CLASSIFICATION_CONFIRMED`
- `NOT_NOW_ITEM_PARKED`
- `NOT_NOW_ITEM_REVIEWED`

Raw thought text is excluded from technical telemetry. Domain events may reference the Capture ID and store user-authored content only inside the private, user-scoped domain ledger.

## V1 data shape

The implementation should keep source and workflow separate:

- `capture_record`: existing immutable raw source.
- `brain_dump_classification`: versioned user-confirmed organizational classification linked to Capture.
- `not_now_item`: the current parked item and its explicit assessment/posture.
- `not_now_item_event` is represented by the existing `domain_event` ledger rather than a second event system.

All tables use forced PostgreSQL RLS and authenticated user scope. The baseline application role receives no authority until the separate capability grant is reviewed and applied.

## Private API surface

Planned endpoints:

- `GET /api/v1/brain-dump`
- `POST /api/v1/brain-dump/:captureId/classification`
- `GET /api/v1/not-now`
- `POST /api/v1/not-now`
- `POST /api/v1/not-now/:itemId/review`

Every write requires a server-derived authenticated user, trusted receive time, bounded input, idempotency identity, domain-event persistence, and fail-closed cross-user validation.

## Mobile-first interaction

- The global Capture action is labeled and explained as Brain Dump without adding a second chatbot.
- Save requires only the raw thought.
- Classification and NOT NOW controls appear after persistence through progressive disclosure.
- Parking shows the five assessment choices and three postures together before the final write.
- The final review states exactly what will change: organizational state only.
- NOT NOW lists parked items newest first, with category, assessment, posture, and provenance.
- No scores, streaks, urgency badges, or attention-grabbing backlog counts.

## Relationships to other modules

- **Today:** may later show an intentional review reminder, but V1 does not inject parked items into Today.
- **Calendar:** no automatic event creation.
- **Journey:** no automatic step, evidence, or direction change.
- **Memory:** raw source is retained through Capture provenance but is not promoted into canonical Memory.
- **Direction / You:** a `Genuine change in direction` assessment opens future deliberate review; it does not change Direction.
- **Daily Return:** may reference that an idea pulled the user away, but Daily Return does not park or promote it automatically.
- **Drift Detector:** later consumes explicit assessment and return decisions; it does not infer commitments from the parking lot.
- **AI:** contextual classification/review assistance only. Life OS remains the home system; ChatGPT remains separate for deep reasoning and returns structured results only when meaningful.

## Explicitly deferred

- project creation or project domain
- automatic recurrence surfacing
- automatic promotion from repeated ideas
- AI-authored canonical classifications
- automatic Direction, Journey, Calendar, Today, or Memory mutations
- Diet-domain behavior
- hosted activation, real-data migration, and deployment

## Delivery order

1. Contracts, validation, lifecycle, and domain events.
2. PostgreSQL migration, forced RLS, indexes, and separate least-privilege grant.
3. Authenticated private reads and idempotent writes.
4. Brain Dump classification and explicit NOT NOW parking inside Capture.
5. Private NOT NOW review surface.
6. Real PostgreSQL, behavior, and responsive visual verification.

