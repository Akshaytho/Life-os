# Life OS Engineering Guardrails

This repository builds a private, mobile-first Personal Life OS. Reliability, provenance, user agency, and reversibility are product requirements, not implementation details.

## Non-negotiable rules

1. Canonical structured state is authoritative for what is true now.
2. Raw conversations, vector similarity, summaries, and AI observations never silently override canonical state.
3. Important state changes emit append-only domain events alongside the canonical mutation.
4. Do not implement full event sourcing unless an ADR explicitly changes that decision.
5. Clearly distinguish FACT, USER REFLECTION, AI OBSERVATION, AI SUGGESTION, and USER DECISION in data and UI.
6. High-authority AI actions must enter proposal/approval flows; external AI never gets unrestricted database writes.
7. Preserve provenance: who/what produced information, when, from which entity/version, and with what authority/confidence.
8. Prefer reversible actions. Avoid destructive mutations where status/supersession can preserve history.
9. Keep development data fake/sample by default. Never commit production secrets or personal exports.
10. Keep the app functional without AI. AI enriches Life OS; it is not the persistence layer.
11. Do not introduce distributed infrastructure (Kafka, Redis, Kubernetes, Elasticsearch, extra vector DB) without evidence and an ADR.
12. Optimize UI for a phone first, desktop second. The interface should feel calm, cinematic, editorial, and non-judgmental rather than like a KPI dashboard.

## Product trust contract

When showing a meaningful claim, the product should make it possible to answer:
- What is this: fact, reflection, observation, suggestion, or decision?
- Where did it come from?
- When was it recorded or last confirmed?
- Can it change my canonical state?
- If it changes state, can I see that change in history?

## Working method

Build in small vertical slices. Each slice should be inspectable, testable, and reviewable before expanding. Prefer clear domain boundaries and boring infrastructure over speculative complexity.
