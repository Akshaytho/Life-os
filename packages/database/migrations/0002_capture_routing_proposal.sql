BEGIN;

CREATE TABLE IF NOT EXISTS capture_record (
  capture_id text PRIMARY KEY CHECK (length(btrim(capture_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  raw_text text NOT NULL CHECK (length(btrim(raw_text)) > 0),
  source text NOT NULL CHECK (source IN ('WEB_APP', 'MCP', 'SCHEDULED_JOB', 'AI_CHAT', 'IMPORT')),
  correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) > 0),
  recorded_at timestamptz NOT NULL,
  UNIQUE (capture_id, user_id)
);

CREATE INDEX IF NOT EXISTS capture_record_user_recorded_idx
  ON capture_record (user_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS routing_proposal (
  proposal_id text PRIMARY KEY CHECK (length(btrim(proposal_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  capture_id text NOT NULL,
  destination text NOT NULL CHECK (destination IN ('CALENDAR')),
  operation text NOT NULL CHECK (operation IN ('CREATE_CALENDAR_PLAN')),
  approval_mode text NOT NULL CHECK (approval_mode IN ('REVIEW_AND_APPLY', 'EXPLICIT_CONFIRMATION', 'HIGH_AUTHORITY_APPROVAL')),
  state text NOT NULL CHECK (state IN ('PROPOSED', 'NEEDS_CONFIRMATION', 'READY_TO_APPLY', 'REJECTED', 'APPLIED')),
  payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  applied_at timestamptz,
  applied_entity_id text,
  applied_event_id text REFERENCES domain_event(event_id) ON DELETE RESTRICT,
  FOREIGN KEY (capture_id, user_id) REFERENCES capture_record(capture_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (state = 'APPLIED' AND applied_at IS NOT NULL AND applied_entity_id IS NOT NULL AND applied_event_id IS NOT NULL)
    OR
    (state <> 'APPLIED' AND applied_at IS NULL AND applied_entity_id IS NULL AND applied_event_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS routing_proposal_user_state_idx
  ON routing_proposal (user_id, state, created_at DESC);

ALTER TABLE applied_proposal
  ADD CONSTRAINT applied_proposal_routing_proposal_fk
  FOREIGN KEY (proposal_id) REFERENCES routing_proposal(proposal_id) ON DELETE RESTRICT;

COMMIT;
