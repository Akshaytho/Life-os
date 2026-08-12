# Life OS — Interaction & Change Ledger V1

**Status:** Canonical companion to `LIFE-OS-CANON-001`

## Product question

**What happened between the user and Life OS, what changed because of it, and why?**

Life OS must make meaningful behavior inspectable without turning the product into a debug console.

The user-facing history and engineering telemetry are related, but they are not the same thing.

---

## 1. Two separate ledgers

### A. User-visible Interaction & Change Ledger

This is part of the product.

It records meaningful interactions and resulting state transitions in human language so the user can inspect what Life OS did.

Examples:

- user said a plan
- Life OS interpreted it as tentative
- Calendar proposal was created
- user approved it
- Calendar changed
- Today recomputed because of the Calendar change
- Life OS suggested moving another flexible item
- user rejected that suggestion
- a Journey learning session was recorded
- a decision superseded an older decision
- a Memory item was retained or archived

This ledger is not raw server logging and is not limited to writes. It can include meaningful no-write outcomes such as:

- "Life OS asked for clarification; nothing changed."
- "Life OS suggested a Calendar move; user declined."
- "ChatGPT learning session ended; no durable Life OS update was needed."

### B. Technical / Developer Telemetry

This is operational engineering data.

Examples:

- request latency
- route / endpoint
- deployment version
- interpreter/model version
- database transaction success/failure
- retry count
- exception class
- correlation/request IDs
- CI/deployment health

Technical telemetry must not appear as the user's Life Timeline and must not be treated as life memory.

The two layers can be correlated by identifiers, but they remain conceptually and visually separate.

---

## 2. What the user-visible ledger must answer

For every meaningful interaction/change, the user should eventually be able to answer:

- **What did I say or do?**
- **What did Life OS understand?**
- **What did Life OS propose?**
- **What did I approve, reject, edit, or ignore?**
- **What actually changed?**
- **Which screen/domain owns the result?**
- **Who/what caused it?** USER, LIFE_OS, LIFE_OS_AI, CHATGPT, SYSTEM, EXTERNAL_INTEGRATION.
- **When did it happen?**
- **Why did Life OS do that?**
- **What source/provenance supports it?**
- **Can I inspect the deeper context?**

The default UI should show a concise answer, with progressive disclosure into the full source and event chain.

---

## 3. Interaction chain

A normal conversational mutation may produce a linked chain like:

```text
USER INPUT
"Gym tomorrow at 7"
      ↓
CAPTURE
exact user source
      ↓
INTERPRETATION
Life OS observation
      ↓
PROPOSAL
Calendar · tomorrow · 19:00
      ↓
USER ACTION
Approved
      ↓
CANONICAL CHANGE
Calendar event created
      ↓
DOMAIN EVENT
CALENDAR_EVENT_CREATED
      ↓
DERIVED EFFECT
Today recalculated around the new commitment
```

The ledger must not flatten all of these into one vague "AI changed Calendar" message.

---

## 4. Authority classes remain visible

Ledger entries must preserve the existing trust language:

- `FACT`
- `REFLECTION`
- `OBSERVATION`
- `SUGGESTION`
- `DECISION`

Examples:

```text
YOU SAID                     USER SOURCE
"I may meet Arjun Saturday."

LIFE OS SAW                  OBSERVATION
This sounds tentative.

LIFE OS PROPOSED             SUGGESTION
Reserve Saturday 7–9 PM for Friends.

YOU CHOSE                    DECISION
Add tentatively.

CALENDAR CHANGED             FACT
Saturday 7–9 PM added as Flexible / Friends.
```

AI interpretation must never be rewritten in the history as if the user originally said it.

---

## 5. Screen/domain change history

Meaningful changes to every major Life OS domain should be traceable.

### Today

Today is primarily a projection. A change in Today may be caused by changes elsewhere rather than by a direct Today write.

Example:

```text
Today changed
Reason: Calendar event added at 19:00
Effect: creator practice moved out of available-evening capacity
Source: Calendar event evt_...
```

The system should distinguish **source change** from **derived screen change**.

### Calendar

Track meaningful create/update/move/cancel/confirmation changes and their origin.

### Journey

Track explicit journey/capability decisions, learning evidence, session summaries, experiments, reel evidence and major state changes. Do not log every rendered calculation as a Journey event.

### Memory

Track retain/archive/supersede/confirm operations and their provenance.

### You

Track durable decisions, direction changes, constitution changes and supersession history with high-authority approval provenance.

---

## 6. Noisy UI events are not life events

Do not put ordinary interface telemetry into the user-visible ledger.

Examples that belong only in technical telemetry unless they have meaningful product consequences:

- user opened a tab
- user scrolled 412 px
- hover state changed
- component rendered
- API request started
- cached query returned
- animation played

A screen visit may be useful for product analytics later, but it is not automatically part of personal life history.

---

## 7. Correlation and causation

The user-facing ledger, canonical domain events and technical telemetry should be connectable through identifiers such as:

- `correlation_id`
- `causation_event_id`
- `request_id`
- `capture_id`
- `interpretation_id`
- `proposal_id`
- `event_id`
- entity IDs
- deployment/build version where useful for debugging

This allows a developer/tester to move from:

> "Why did Today show this?"

into:

> Today projection ← Calendar event ← approved proposal ← interpretation ← original Capture

without polluting the user experience with infrastructure details.

---

## 8. Development and deployment feedback loop

This ledger is also a product-development instrument.

With user consent and appropriate privacy controls, development review can compare:

```text
USER INTENT
      ↓
Life OS interpretation
      ↓
Life OS proposal/action
      ↓
actual canonical result
      ↓
what the UI displayed
      ↓
USER FEEDBACK
"This is what I meant" / "This is wrong" / correction
      ↓
product/AI/routing improvement
      ↓
new deployment
      ↓
observe again
```

This supports continuous improvement based on real behavior rather than sample assumptions.

It can help answer:

- which inputs are frequently misunderstood?
- where does the user repeatedly correct routing?
- which proposals are usually rejected?
- which screen changes are confusing?
- where does the UI hide needed context?
- where does Life OS ask unnecessary clarification?
- which AI suggestions are useful versus noise?
- did a new deployment improve or regress a behavior?

This feedback loop must not silently convert private life content into unrestricted analytics.

---

## 9. Deployment/version provenance

Meaningful system-generated outcomes should be traceable to the software/model version that produced them when useful for debugging.

Technical telemetry may record:

- application release / Git commit
- routing rules version
- Life OS AI prompt/policy version
- AI model/provider version where allowed/available
- database migration version

The user-facing ledger normally does **not** need to show these details by default, but an advanced provenance/debug view can expose them when needed.

This lets us compare behavior before/after a deployment without changing the life-history meaning of the record.

---

## 10. Privacy rules

The ledger can contain highly personal information and therefore follows the strongest relevant Life OS privacy rules.

- no production ledger data in GitHub
- no raw personal content in CI fixtures
- technical logs should minimize personal text
- raw Capture/conversation content should be referenced rather than duplicated unnecessarily
- AI/provider context follows minimum-necessary disclosure
- user deletion/privacy requirements can override append-only retention
- developer observability must be permissioned and environment-specific

Development should use synthetic/fake ledger records until the production privacy boundary is ready.

---

## 11. UI principle

The user should not have to read an engineering audit log.

Use progressive disclosure:

```text
GLANCE
Calendar changed · 7:00 PM Gym added

SUMMARY
You said: "Gym tomorrow at 7."
Life OS proposed: Calendar / Health / Important
You approved it.
Today now has 45 minutes less open evening time.

FULL TRACE
Capture → interpretation → proposal → approval → domain event → affected projections
```

This follows the canonical rule:

> **Life OS stores depth; the UI shows compression; AI helps the user move between them.**

---

## 12. Testing rule

As real Life OS flows become executable, tests should validate not only final state but also the explainable interaction chain.

For important flows, test:

1. original user source remains recoverable
2. interpretation is labeled observation
3. proposal is labeled suggestion
4. approval/rejection actor is correct
5. canonical mutation is correct
6. domain event is emitted when canonical state changes
7. correlation/causation chain is intact
8. derived screens can explain which source state caused their change
9. no technical-only event is accidentally presented as life history
10. no raw private text is unnecessarily duplicated into operational logs

---

## 13. Relationship to Life OS AI and ChatGPT

Life OS AI may use the ledger to answer questions such as:

- "Why is my evening busy?"
- "What changed since yesterday?"
- "Why did you move this?"
- "What did I reject last week?"
- "When did this plan become confirmed?"

ChatGPT may receive a scoped ledger/context slice through MCP for deeper analysis when explicitly useful.

Neither AI may silently rewrite historical entries to make past behavior look cleaner than it was.

Corrections and superseding decisions create new history/provenance rather than falsifying old history, subject to privacy/deletion requirements.

---

## 14. Implementation order

1. Keep canonical domain events authoritative for meaningful committed state changes.
2. Add a stable user-facing interaction/change projection over Capture, interpretation, proposal, user response and domain events.
3. Add projection-impact explanations such as Calendar → Today.
4. Add separate structured technical telemetry with correlation IDs.
5. Add development-only inspection tools over synthetic/test data.
6. When Supabase/Railway development environments exist, attach deployment/build provenance.
7. Only after privacy controls exist, consider opt-in real-usage debugging/feedback workflows.

The ledger is therefore part of both **trustworthy UX** and **continuous product development**, but the user's life history and developer telemetry must never collapse into the same dataset or interface.
