BEGIN;

CREATE TABLE IF NOT EXISTS calendar_event (
  id text PRIMARY KEY CHECK (length(btrim(id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  category text NOT NULL CHECK (category IN (
    'Work', 'Creator', 'Learning', 'Health', 'Family', 'Friends', 'Travel', 'Personal', 'Rest'
  )),
  commitment text NOT NULL CHECK (commitment IN ('Fixed', 'Important', 'Flexible', 'Optional')),
  created_at timestamptz NOT NULL,
  source_proposal_id text NOT NULL UNIQUE,
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS calendar_event_user_starts_idx
  ON calendar_event (user_id, starts_at);

CREATE TABLE IF NOT EXISTS domain_event (
  event_id text PRIMARY KEY CHECK (length(btrim(event_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN (
    'USER', 'LIFE_OS', 'LIFE_OS_AI', 'CHATGPT', 'SYSTEM', 'EXTERNAL_INTEGRATION'
  )),
  actor_id text,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  source text NOT NULL CHECK (source IN ('WEB_APP', 'MCP', 'SCHEDULED_JOB', 'AI_CHAT', 'IMPORT')),
  correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) > 0),
  causation_event_id text,
  payload_json jsonb NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0)
);

CREATE INDEX IF NOT EXISTS domain_event_user_recorded_idx
  ON domain_event (user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS domain_event_correlation_idx
  ON domain_event (correlation_id, recorded_at);

CREATE TABLE IF NOT EXISTS applied_proposal (
  proposal_id text PRIMARY KEY CHECK (length(btrim(proposal_id)) > 0),
  applied_at timestamptz NOT NULL,
  confirmed_by_actor_id text NOT NULL CHECK (length(btrim(confirmed_by_actor_id)) > 0),
  request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  entity_type text NOT NULL,
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  event_id text NOT NULL UNIQUE REFERENCES domain_event(event_id) ON DELETE RESTRICT
);

COMMIT;
