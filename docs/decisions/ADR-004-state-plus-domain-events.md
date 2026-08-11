# ADR-004: Canonical State Plus Append-Oriented Domain Events

Status: Accepted

## Context

Life OS needs both simple current-state queries and a trustworthy explanation of what changed over time. Full event sourcing would add significant complexity to a personal V1.

## Decision

Persist canonical state normally and append a corresponding domain event for meaningful mutations within the same transaction. Do not rebuild ordinary UI state by replaying the entire event stream.

## Consequences

- Today and other screens remain simple to query
- chronology and causation are preserved
- historical corrections create correcting events rather than ordinary rewrites
- a transactional outbox can be added when asynchronous consumers are introduced
