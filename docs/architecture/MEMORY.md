# Memory and Retrieval Architecture

## Objective

Life OS memory must preserve context without treating every historical statement as equally true.

The system separates four concepts:

1. **Canonical current state** — what is true now
2. **Historical evidence** — what happened and when
3. **Semantic retrieval** — what old information is relevant
4. **Derived memory** — summaries and patterns inferred from evidence

## Authority Hierarchy

Default ordering:

1. Active structured state
2. Active explicit decisions
3. Personal constitution / principles
4. Confirmed domain events and facts
5. User reflections
6. Derived patterns
7. Raw conversations
8. AI hypotheses

Recency and authority are separate dimensions. A recent brain dump does not automatically overrule an older active decision.

## Memory Types

Canonical memory may include:

- Constitution
- Decision
- Current state
- Fact
- Learning
- Reflection
- Pattern
- Person context
- Experience

Important memories are versioned rather than silently overwritten.

## Vector Search

Embeddings are retrieval aids only.

Vector results must retain:

- source
- source entity
- memory/version identity
- authority/status
- embedding model/version

Semantic similarity never decides current truth.

## Consolidation

Repeated similar statements should not create unlimited near-duplicate canonical memories.

A consolidation process classifies new evidence as:

- reinforces existing memory
- modifies existing memory
- contradicts existing memory
- represents new memory

Raw history remains available even when canonical memory is consolidated.

## Contradictions

Contradictions are labeled, not silently solved by a language model.

Example:

- Active decision: Sound Design is current phase
- Recent reflection: maybe storytelling should come first

The current phase remains Sound Design while the reflection is treated as unresolved reconsideration unless an explicit decision supersedes it.

## Retrieval Profiles

### Current / Planning

Prioritize current state, calendar, active decisions, today's events, and active journey.

### Historical / Decision

Prioritize decision history, events, source conversation, and memory versions.

### Pattern / Drift

Use an appropriate time window, summaries, drift events, calendar pressure, activity evidence, and reflections.

### Creator

Use skill sessions, techniques, reels, evidence, user reviews, external analyses, and learnings.

## Context Packages

AI receives normalized context packages rather than raw database dumps. Packages include intent, current truth, relevant decisions, time-scoped events, selected memories, conflicts, and provenance.

## Long-Range Retrieval

Prefer hierarchy:

monthly summary -> weekly summary -> daily summary -> raw events

Raw history is expanded only when the question requires it.

## Memory Promotion

Ordinary AI conversation does not automatically become permanent canonical memory. High-authority promotions require evidence and, where appropriate, user approval.
