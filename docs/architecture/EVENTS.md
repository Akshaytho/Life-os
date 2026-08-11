# Domain Event Architecture

## Purpose

The UI is a projection of current state. The event timeline preserves how that state came to exist.

API access logs are not a substitute for life/domain events.

## Event Shape

Every meaningful domain event should include at least:

- event_id
- user_id
- occurred_at
- recorded_at
- actor_type
- actor_id when applicable
- event_type
- entity_type
- entity_id
- source
- correlation_id
- causation_event_id when applicable
- payload_json
- schema_version

`occurred_at` means when the event happened in life/domain time. `recorded_at` means when Life OS learned about it.

## Actor Types

Initial examples:

- USER
- LIFE_OS
- LIFE_OS_AI
- CHATGPT
- SYSTEM
- EXTERNAL_INTEGRATION

## Sources

Initial examples:

- WEB_APP
- MCP
- SCHEDULED_JOB
- AI_CHAT
- IMPORT
- future calendar integrations

## Correlation and Causation

Related events share a correlation ID. Direct causal chains use causation_event_id.

Example:

```text
CALENDAR_EVENT_CREATED
  -> SCHEDULE_CONFLICT_DETECTED
  -> CREATOR_SESSION_RESCHEDULE_PROPOSED
```

This allows later reasoning to distinguish causation from events that merely happened near each other.

## Initial Event Families

Direction / decisions:

- DIRECTION_CHANGED
- DECISION_PROPOSED
- DECISION_ACTIVATED
- DECISION_SUPERSEDED

Calendar / Today:

- CALENDAR_EVENT_CREATED
- CALENDAR_EVENT_UPDATED
- CALENDAR_EVENT_RESCHEDULED
- DAILY_PLAN_CREATED
- DAILY_REVIEW_COMPLETED

Journey / creator:

- SKILL_PHASE_ACTIVATED
- SKILL_SESSION_STARTED
- SKILL_SESSION_COMPLETED
- SKILL_EVIDENCE_CREATED
- REEL_CREATED
- REEL_REVIEWED
- REEL_PUBLISHED
- LEARNING_CAPTURED

Return system:

- BRAIN_DUMP_CAPTURED
- IDEA_PARKED
- DRIFT_RECORDED
- DRIFT_RESOLVED
- DIRECTION_REAFFIRMED

External intelligence:

- EXTERNAL_ANALYSIS_SUBMITTED
- EXTERNAL_OBSERVATION_ACCEPTED
- EXTERNAL_OBSERVATION_REJECTED

## Mutation Rule

Canonical mutation and domain-event append should occur transactionally. A completed state without its meaningful event, or an event claiming a change that was not persisted, is an integrity failure.

## Event Evolution

Event payloads include schema_version. Old events remain interpretable when payload schemas evolve.

## External Cursors

Consumers such as scheduled review or ChatGPT integration track their own last-seen event cursor. Cursor-based change retrieval is preferred over timestamp-only polling.
