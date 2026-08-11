# MCP Architecture

## Objective

ChatGPT should be able to understand Life OS without direct database access and without mirroring every internal REST endpoint.

MCP exposes high-level, scoped capabilities built on top of the application/domain layer.

## Initial Read-Only Tools

Planned tools:

- lifeos_get_current_state
- lifeos_get_today
- lifeos_get_day_context
- lifeos_get_week_context
- lifeos_get_changes_after_event
- lifeos_get_decisions
- lifeos_get_decision_history
- lifeos_search_memory
- lifeos_get_creator_progress
- lifeos_get_reel_context
- lifeos_get_drift_context
- lifeos_get_calendar_context

## Write Boundary

Initial MCP is read-only except a controlled external-analysis submission path.

Later writes should normally be proposals:

- lifeos_submit_external_analysis
- lifeos_propose_decision
- lifeos_propose_memory
- lifeos_propose_calendar_change
- lifeos_propose_next_experiment
- lifeos_propose_not_now_item

High-authority state changes never become direct unrestricted MCP CRUD operations.

## External Intelligence Inbox

When ChatGPT analyzes a reel or other artifact, the result enters an inbox with:

- source system
- target entity/version
- observations
- confidence
- suggested actions
- provenance
- review status

User reflection and external AI analysis remain separate records.

## Scopes

Initial conceptual scopes:

- lifeos.current.read
- lifeos.timeline.read
- lifeos.memory.read
- lifeos.calendar.read
- lifeos.creator.read
- lifeos.drift.read
- lifeos.external_analysis.write
- lifeos.proposals.write

Sensitive categories may later have separate scopes.

## Audit

Every MCP tool call records:

- request ID
- source/consumer
- tool
- time
- scope
- broad resource types accessed
- result status

## Consumer Cursor

Each external consumer keeps independent state such as last_seen_event_id. This enables efficient catch-up and avoids repeatedly analyzing the same day/event range.

## Scheduled Review Direction

A scheduled review should:

1. fetch changes after its cursor
2. stop if nothing meaningful changed
3. fetch only required current/domain context
4. classify outcome as NO_ACTION, ATTENTION, or INTERRUPT
5. notify only when useful
6. advance cursor after a successful review

The desired default is silence, not daily notification spam.

## Security Boundary

MCP never receives raw database credentials. It authenticates to a gateway/service that enforces scopes, domain rules, provenance, approval boundaries, and auditing.
