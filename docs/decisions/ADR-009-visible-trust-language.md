# ADR-009: Make trust classes visible in the product

## Status
Accepted

## Context

Life OS will combine user decisions, recorded facts, personal reflections, AI observations, and AI suggestions. If those appear with the same authority, the application becomes harder to trust as intelligence increases.

## Decision

The product and contracts distinguish five information classes: FACT, REFLECTION, OBSERVATION, SUGGESTION, and DECISION.

The UI may keep provenance visually quiet, but meaningful claims must retain inspectable source/time information. Suggestions must not look like decisions. AI-derived observations must not look like user-authored facts.

## Consequences

- UI components need trust/provenance primitives.
- Future API contracts need source and authority metadata for knowledge-like records.
- High-authority state changes continue to use explicit approval/decision flows.
- The first Today slice demonstrates this distinction even before persistence exists.
