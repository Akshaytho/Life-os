# Life OS — Product Doctrine

This document consolidates the product decisions that must remain stable as implementation evolves. It exists so a long conversation, a new UI experiment, or a new AI idea cannot silently replace earlier agreements.

If a future design conflicts with this doctrine, the design must change or the doctrine must be deliberately revised through an explicit product decision.

## 1. Product purpose

Life OS is a private, mobile-first personal operating system that externalizes memory, preserves chosen direction, represents real life constraints, supports deliberate capability growth, and makes returning after drift easy.

It is not:

- a generic productivity dashboard
- a habit/streak app
- a static life journal
- a chat transcript viewer
- an autonomous AI life manager
- a system where every new idea becomes a goal

The core questions are:

- Where am I going?
- What matters today given the life I actually have today?
- What happened?
- What did I decide and why?
- What am I becoming capable of?
- What have I learned?
- Am I drifting, and how do I return?
- What is current truth versus history versus AI interpretation?

## 2. Stable navigation responsibilities

### Today

Today answers: **What matters today given the life I actually have today?**

It composes current direction, calendar reality, active journey/capability, intentionally small focus, useful attention, capture/drift access, and evening review.

Today is not a giant task list. Real family, friends, health, work, appointments, travel, rest, and other commitments alter what is reasonable to expect from the day.

### Journey

Journey answers: **What am I deliberately becoming capable of, and what evidence shows movement?**

Journey is selective. It must not become a dump of everyday life activity.

A Journey exists only after an explicit user decision. A passing interest does not become an active journey automatically.

Top-level Journey is a long-term Becoming overview. Detailed practice, techniques, learning sessions, reels, evidence and reflections live in drill-down capability views.

### Calendar

Calendar owns time-bound reality and plans.

Plans, appointments, work, gym, social time, family events, travel, creator sessions, rest and other dated commitments can be routed here when the user expresses or confirms them.

Events carry category and commitment semantics so Life OS can reason about conflicts and capacity.

### Memory

Memory preserves current truth, historical evidence, retrievable experience and derived understanding without treating every old statement as equally authoritative.

Memory is not a chronological dump of everything on every screen.

### You

You represents durable direction, personal constitution/principles, major decisions, identity-level context, NOT NOW items, patterns, privacy/AI controls and other long-lived self context.

## 3. Cross-cutting systems

AI, Brain Dump, Drift, Capture, Reviews, Notifications and External Intelligence are cross-cutting systems rather than mandatory permanent destinations.

### Brain Dump

Capture raw thought first. Classification happens after capture.

Potential classes include goal, idea, problem, emotion, person, concern, task, learning, travel, content, career, diet and NOT NOW.

### Drift

The goal is not zero drift. The goal is reliable return.

A drift flow may help distinguish temporary inspiration, comparison, avoidance, emotional reaction or genuine reconsideration.

### NOT NOW

New possibilities can be preserved without becoming active commitments.

Repeatedly returning ideas can later be deliberately reconsidered.

### Reviews

Reviews compress time and close loops. They do not score the user with percentages.

Daily reviews ask what mattered, what moved, what did not and why, what was learned, whether the user returned after drift, and what is worth preserving.

Weekly, monthly and later yearly reviews should summarize meaningful change rather than dump raw events.

## 4. Life OS AI and ChatGPT are different roles

Life OS keeps its own native AI.

### Life OS AI

Life OS AI is the everyday in-product chief-of-staff layer.

It should help with:

- understanding ordinary user input
- routing information to the right Life OS domains
- planning around real calendar constraints
- retrieving relevant memory
- explaining current state
- detecting conflicts
- helping with Today
- helping with drift/return
- proposing structured changes
- helping the user inspect progress and history

It is close to Life OS structured state and uses narrow, product-specific tools.

It should not require ChatGPT for every ordinary operation.

Examples that can stay inside Life OS AI:

- "Move gym later."
- "What do I have tomorrow?"
- "When did I last train legs?"
- "Show what I learned about sound last month."
- "I have a trip idea for next month."
- "I am drifting."

### ChatGPT

ChatGPT is the deeper external specialist / teacher / thinking partner.

Use ChatGPT when the user wants depth that benefits from extended reasoning or conversation, such as:

- deep learning and teaching
- challenging the user's understanding
- reasoning through complex doubts
- deeper reel analysis
- deeper reflection or exploration
- difficult decision analysis
- richer synthesis across selected Life OS context

ChatGPT connects through scoped MCP capabilities. It does not receive direct database access.

Life OS remains useful even if ChatGPT is disconnected.

## 5. Two-way ChatGPT loop

ChatGPT integration is two-way, but it is not an unrestricted write channel.

The intended loop is:

1. User explicitly enters a deeper ChatGPT interaction from Life OS or asks ChatGPT to work with Life OS context.
2. Life OS provides a minimal, intent-specific context package.
3. User and ChatGPT have a real two-way conversation.
4. ChatGPT may produce a structured result.
5. Life OS classifies the result by authority and destination.
6. Low-risk history/evidence may be recorded.
7. Suggestions remain suggestions.
8. High-authority changes require explicit user approval.

A ChatGPT conversation may produce no Life OS update at all.

## 6. Adaptive learning model

Learning must not be hard-coded into one fixed sequence merely because a UI prototype used that order.

Different users may learn in different orders, at different speeds, with different doubts and different evidence.

For the current Travel Creator journey, Sound Design is the active capability, but techniques and next learning steps are adaptive.

When the user chooses **Continue Learning**, the system should be able to provide ChatGPT with relevant context such as:

- what the user previously learned
- previous learning-session summaries
- demonstrated understanding
- unresolved doubts
- practice/reel evidence
- user reflections
- external observations
- current capability decision
- available time / near-term context when useful

ChatGPT can then choose an appropriate course of action for that session rather than blindly following a predefined curriculum.

The user should be able to explain their understanding back. ChatGPT may challenge, clarify and test that understanding before concluding the session.

At the end, the useful result can include:

- topic
- demonstrated understanding
- unresolved uncertainty
- evidence used
- retained learning candidate
- next experiment suggestion
- source conversation reference

A learning session is historical fact once completed. ChatGPT's interpretation of understanding remains an observation unless the product deliberately promotes it according to the memory/authority model.

## 7. Short UI, deep data

**Life OS stores depth; the UI shows compression; AI helps the user move between them.**

The UI must remain usable even after years of data. Therefore every major information type needs progressive disclosure.

A record may have three practical levels:

### Glance

Compact state sufficient for orientation.

Example:

- Sound continuity
- learned/reviewed recently
- one open doubt

### Summary

Structured explanation of what changed, what was understood, evidence, uncertainty and next action.

### Full context

Original learning session, source conversation, related reel, previous related memories, event history and the ability to ask Life OS AI / ChatGPT about it.

Short UI must never mean destructive summarization. Full source/history remains retrievable where policy allows.

## 8. Input routing model

The user should not need to manually choose database categories for every statement.

Natural-language input can be interpreted and routed by Life OS AI.

Examples:

- "My friend is visiting Saturday" -> potential Calendar event / plan
- "I want to go to Goa next month" -> initially idea/plan depending certainty, not automatically a committed trip
- "Yes, Sep 12-16 is decided" -> decision + Calendar event(s)
- "I learned why room tone matters" -> learning-session / learning evidence
- "I want to become a filmmaker now" -> reflection/reconsideration, not automatic Journey replacement
- "My shoulder felt uncomfortable today" -> user-reported health observation, not an AI diagnosis

Routing is allowed to be intelligent; authority changes are not allowed to be silent.

## 9. Calendar and planning semantics

Calendar categories initially include:

- Work
- Creator
- Learning
- Health
- Family
- Friends
- Travel
- Personal
- Rest

Commitment levels initially include:

- Fixed
- Important
- Flexible
- Optional

Calendar informs Today and planning. Life OS AI can propose rescheduling based on conflicts/capacity, but meaningful changes follow the appropriate approval rules.

Day, week, month and later year views should use different levels of compression rather than rendering the same event list at different scales.

## 10. Journey hierarchy

Top-level Journey must remain durable across days, months and years.

Current hierarchy:

- Journey overview: deliberate becoming, active journey, current capability, recent meaningful evidence, current edge, long arc
- Journey detail: one chosen journey such as Travel Creator
- Capability detail: one capability such as Sound Design
- Session/evidence detail: learning sessions, practice, reels, learnings, reviews and source context

Future skill labels are orientation, not commitments.

No fake mastery percentages, streaks or gamified completion rings.

Evidence can include Learned, Practised, Applied, Reviewed and Repeated, but these are evidence categories rather than a mandatory sequential curriculum.

The interface must adapt when techniques, ordering or learning strategy change.

## 11. Reels and creator evidence

A reel is both creative output and capability evidence.

Store separately where relevant:

- intention
- techniques
- user reflection
- related learnings
- stage/lifecycle
- external analysis

User reflection and external AI observations are never conflated.

## 12. Memory authority model

Life OS separates:

1. canonical current truth
2. historical evidence
3. semantic retrieval
4. derived memory

Default authority order:

1. active structured state
2. active explicit decisions
3. personal constitution / principles
4. confirmed events and facts
5. user reflections
6. derived patterns
7. raw conversations
8. AI hypotheses

Recency is not authority.

Raw conversation does not automatically become canonical truth.

Vector similarity is a retrieval aid only and never decides current truth.

Contradictions are labeled rather than silently resolved by AI.

Long-range retrieval should prefer summary hierarchy such as monthly -> weekly -> daily -> raw events, expanding only when needed.

## 13. Trust and provenance

The interface must distinguish at least:

- FACT
- REFLECTION
- OBSERVATION
- SUGGESTION
- DECISION

Provenance remains inspectable.

Derived AI interpretation must never visually masquerade as user-authored fact or decision.

Important AI-generated changes use proposals / approvals rather than silently changing canonical state.

## 14. Event integrity

The UI is a projection of current state; domain events preserve how state came to exist.

Meaningful canonical mutations and their domain events should be written transactionally.

Actor types include USER, LIFE_OS, LIFE_OS_AI, CHATGPT, SYSTEM and EXTERNAL_INTEGRATION.

`occurred_at` and `recorded_at` are distinct because Life OS may learn about something after it happened.

Correlation and causation are preserved for explainability.

Technical/security logs are separate from the user's life timeline.

## 15. AI independence and privacy

Life OS core functionality must remain useful when AI is disabled or unavailable.

AI receives only the minimum context required for the specific intent.

MCP starts scoped/read-only except controlled external-analysis submission and later proposal-style writes.

High-impact operations require explicit approval, including direction changes, active-skill changes, major decision supersession and destructive canonical-memory operations.

Real production data must never be required for normal development.

## 16. Design doctrine

The product is a web-based mobile app first.

Visual direction:

- cinematic
- calm
- personal
- tactile
- editorial where meaning benefits from it
- instrument-like where state/time/capability benefits from it

Avoid generic SaaS dashboard grids, equal cards, fake KPIs, neon glassmorphism and gamified progress.

Design order for every screen:

1. product question
2. information hierarchy
3. data representation
4. interaction model
5. typography
6. spacing/alignment
7. color/material
8. motion
9. responsive/accessibility behavior
10. implementation

Every important UI change is visually reviewed at phone, tablet and desktop sizes before merge.

The UI must be data-shape-adaptive. A design is not accepted if it only works for the current sample values, a single fixed learning order, or one narrow content length.

## 17. Architecture invariants

- TypeScript-first monorepo
- modular monolith
- PostgreSQL canonical source of truth
- Supabase planned for PostgreSQL / Auth / Storage / pgvector
- Railway planned for compute
- vector retrieval is not authoritative memory
- canonical state + append-only domain events, not pure event sourcing
- AI provider behind abstraction
- ChatGPT through scoped MCP, never direct DB
- no unnecessary Kafka/Kubernetes/Redis/Elasticsearch in V1
- fake/sample data until privacy and production controls are ready

## 18. Change control

New product ideas should be classified as one of:

- refinement: fits this doctrine
- extension: adds capability without changing existing ownership
- conflict: contradicts a finalized responsibility or trust rule
- superseding decision: deliberately changes doctrine

A conflict must not be implemented silently.

Before major new screens or workflows, check them against this document, the PRD, architecture ADRs, security model and relevant domain-specific design docs.
