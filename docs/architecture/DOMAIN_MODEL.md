# Domain Model Baseline

## Identity
- user
- profile/settings
- integration permissions

## Direction
- direction
- principle
- goal
- decision
- idea / NOT NOW item

## Life / Today
- calendar_event
- daily_plan
- daily_plan_item
- daily_review

## Becoming
- journey
- skill
- technique
- skill_session
- skill_evidence

## Creator
- reel
- reel_version
- reel_technique
- learning
- reel_learning

## Return System
- brain_dump
- brain_dump_classification
- drift_event
- drift_action

## Memory
- memory
- memory_version
- memory_embedding
- daily_summary
- weekly_summary
- future monthly_summary

## Intelligence
- conversation
- conversation_message
- ai_run
- retrieval_trace
- approval_request
- external_analysis
- external_observation

## Event / Integration
- domain_event
- outbox_message (when async processing is introduced)
- external_consumer_state
- integration_audit_entry

## Canonical vs Historical vs Derived

### Canonical
Used to answer what is currently true:
- directions
- active decisions
- goals
- calendar events
- journeys/skills
- reels and user-authored state

### Historical
Evidence of what happened:
- domain events
- decision history
- memory versions
- conversation messages
- audit records

### Derived
AI/system interpretation:
- classifications
- summaries
- patterns
- external observations
- retrieval traces

Derived data never silently overwrites canonical state.

## Decision Lifecycle

PROPOSED -> ACTIVE -> SUPERSEDED or REVOKED

Explicit decision history is preserved.

## Skill Lifecycle

FUTURE -> ACTIVE -> PAUSED -> ACTIVE or COMPLETED

## Reel Lifecycle

IDEA -> PLANNED -> SHOT -> EDITING -> REVIEWED -> PUBLISHED

## Idea Lifecycle

CAPTURED -> CLASSIFIED -> NOT_NOW -> UNDER_REVIEW -> PROMOTED or DISMISSED

## Drift Lifecycle

RECORDED -> UNDERSTOOD/CLASSIFIED -> RESOLVED

Resolution may include RETURN_TO_DIRECTION, PARK_IDEA, REFLECT, CHANGE_PLAN, or deliberate reconsideration.
