# API Architecture Baseline

## Principle

Internal HTTP APIs serve the Life OS web client and domain workflows. MCP is a higher-level integration layer and must not simply mirror every REST endpoint.

## Initial Domain Routes

Conceptual V1 namespaces:

- `/api/v1/direction`
- `/api/v1/decisions`
- `/api/v1/today`
- `/api/v1/calendar`
- `/api/v1/journey`
- `/api/v1/skills`
- `/api/v1/reels`
- `/api/v1/drifts`
- `/api/v1/brain-dumps`
- `/api/v1/reviews`
- `/api/v1/memory`
- `/api/v1/events`
- `/api/v1/context`
- `/api/v1/external-intelligence`

## Key Contract Ideas

### Today

`GET /api/v1/today`

Returns a composed read model containing current direction, calendar constraints, active journey/skill, planned focus, completed items, drift summary, and attention items.

### Timeline

`GET /api/v1/events/timeline?date=...`

`GET /api/v1/events/after/{eventId}`

The latter provides cursor-based catch-up for external consumers and background review.

### Context

`GET /api/v1/context/current`

`GET /api/v1/context/day/{date}`

`GET /api/v1/context/week`

`POST /api/v1/context/query`

Context endpoints build normalized intelligence packages; they are not raw database dumps.

### High-Authority Mutations

Direction changes and major decisions should use proposal endpoints rather than silent replacement.

### External Intelligence

External AI submits analysis to a controlled inbox. The submission records source, target entity/version, observations, confidence, and suggested actions.

## API Conventions

- versioned under `/api/v1`
- consistent error envelope
- correlation IDs for related operations
- idempotency keys for retry-sensitive create operations
- authenticated access
- no direct database exposure
- domain events emitted for meaningful state changes
