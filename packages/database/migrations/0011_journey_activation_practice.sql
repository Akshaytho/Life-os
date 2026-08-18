BEGIN;

CREATE TABLE IF NOT EXISTS journey_capability_decision (
  journey_decision_id text PRIMARY KEY CHECK (length(btrim(journey_decision_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  journey_code text NOT NULL CHECK (journey_code = 'TRAVEL_CREATOR'),
  capability_code text NOT NULL CHECK (capability_code = 'SOUND_DESIGN'),
  starting_technique text NOT NULL CHECK (starting_technique IN (
    'ENVIRONMENTAL_SOUND',
    'J_L_CUTS',
    'DIALOGUE_CLARITY',
    'MUSIC_RELATIONSHIP',
    'SILENCE',
    'SOUND_EFFECTS',
    'LAYERING'
  )),
  decision_reason text CHECK (
    decision_reason IS NULL
    OR (length(btrim(decision_reason)) > 0 AND char_length(decision_reason) <= 2000)
  ),
  authority_class text NOT NULL CHECK (authority_class = 'DECISION'),
  source text NOT NULL CHECK (source IN ('WEB_APP', 'MCP', 'SCHEDULED_JOB', 'AI_CHAT', 'IMPORT')),
  correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) > 0),
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  decided_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  UNIQUE (journey_decision_id, user_id),
  UNIQUE (user_id),
  UNIQUE (user_id, request_id),
  CHECK (recorded_at >= decided_at)
);

CREATE INDEX IF NOT EXISTS journey_capability_decision_user_time_idx
  ON journey_capability_decision (user_id, decided_at DESC, journey_decision_id);

ALTER TABLE journey_capability_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_capability_decision FORCE ROW LEVEL SECURITY;

CREATE POLICY journey_capability_decision_user_policy ON journey_capability_decision
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

CREATE TABLE IF NOT EXISTS journey_practice_session (
  practice_session_id text PRIMARY KEY CHECK (length(btrim(practice_session_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  journey_decision_id text NOT NULL,
  technique text NOT NULL CHECK (technique IN (
    'ENVIRONMENTAL_SOUND',
    'J_L_CUTS',
    'DIALOGUE_CLARITY',
    'MUSIC_RELATIONSHIP',
    'SILENCE',
    'SOUND_EFFECTS',
    'LAYERING'
  )),
  experiment_intention text CHECK (
    experiment_intention IS NULL
    OR (length(btrim(experiment_intention)) > 0 AND char_length(experiment_intention) <= 4000)
  ),
  source text NOT NULL CHECK (source IN ('WEB_APP', 'MCP', 'SCHEDULED_JOB', 'AI_CHAT', 'IMPORT')),
  correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) > 0),
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  started_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  UNIQUE (practice_session_id, user_id),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (journey_decision_id, user_id)
    REFERENCES journey_capability_decision(journey_decision_id, user_id)
    ON DELETE RESTRICT,
  CHECK (recorded_at >= started_at)
);

CREATE INDEX IF NOT EXISTS journey_practice_session_user_time_idx
  ON journey_practice_session (user_id, started_at DESC, practice_session_id);

CREATE INDEX IF NOT EXISTS journey_practice_session_decision_fk_idx
  ON journey_practice_session (journey_decision_id, user_id);

ALTER TABLE journey_practice_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_practice_session FORCE ROW LEVEL SECURITY;

CREATE POLICY journey_practice_session_user_policy ON journey_practice_session
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

CREATE TABLE IF NOT EXISTS journey_practice_completion (
  practice_completion_id text PRIMARY KEY CHECK (length(btrim(practice_completion_id)) > 0),
  practice_session_id text NOT NULL,
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  reflection_note text CHECK (
    reflection_note IS NULL
    OR (length(btrim(reflection_note)) > 0 AND char_length(reflection_note) <= 4000)
  ),
  retained_learning_candidate text CHECK (
    retained_learning_candidate IS NULL
    OR (
      length(btrim(retained_learning_candidate)) > 0
      AND char_length(retained_learning_candidate) <= 4000
    )
  ),
  reflection_authority_class text NOT NULL CHECK (reflection_authority_class = 'REFLECTION'),
  source text NOT NULL CHECK (source IN ('WEB_APP', 'MCP', 'SCHEDULED_JOB', 'AI_CHAT', 'IMPORT')),
  correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) > 0),
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  UNIQUE (practice_completion_id, user_id),
  UNIQUE (practice_session_id, user_id),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (practice_session_id, user_id)
    REFERENCES journey_practice_session(practice_session_id, user_id)
    ON DELETE RESTRICT,
  CHECK (recorded_at >= completed_at)
);

CREATE INDEX IF NOT EXISTS journey_practice_completion_user_time_idx
  ON journey_practice_completion (user_id, completed_at DESC, practice_completion_id);

CREATE INDEX IF NOT EXISTS journey_practice_completion_session_fk_idx
  ON journey_practice_completion (practice_session_id, user_id);

ALTER TABLE journey_practice_completion ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_practice_completion FORCE ROW LEVEL SECURITY;

CREATE POLICY journey_practice_completion_user_policy ON journey_practice_completion
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

CREATE OR REPLACE FUNCTION lifeos_enforce_one_open_practice_session()
RETURNS trigger
LANGUAGE plpgsql
AS $lifeos$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('life-os-open-practice:' || NEW.user_id, 0)
  );
  IF EXISTS (
    SELECT 1
      FROM journey_practice_session session
      LEFT JOIN journey_practice_completion completion
        ON completion.practice_session_id = session.practice_session_id
       AND completion.user_id = session.user_id
     WHERE session.user_id = NEW.user_id
       AND completion.practice_completion_id IS NULL
  ) THEN
    RAISE EXCEPTION 'an open Journey practice session already exists'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END
$lifeos$;

REVOKE ALL PRIVILEGES ON FUNCTION lifeos_enforce_one_open_practice_session() FROM PUBLIC;

CREATE TRIGGER journey_practice_one_open_trigger
BEFORE INSERT ON journey_practice_session
FOR EACH ROW EXECUTE FUNCTION lifeos_enforce_one_open_practice_session();

CREATE OR REPLACE FUNCTION lifeos_validate_practice_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $lifeos$
DECLARE
  session_started_at timestamptz;
BEGIN
  SELECT started_at
    INTO session_started_at
    FROM journey_practice_session
   WHERE practice_session_id = NEW.practice_session_id
     AND user_id = NEW.user_id;
  IF session_started_at IS NULL OR NEW.completed_at < session_started_at THEN
    RAISE EXCEPTION 'Journey practice completion precedes its session'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$lifeos$;

REVOKE ALL PRIVILEGES ON FUNCTION lifeos_validate_practice_completion() FROM PUBLIC;

CREATE TRIGGER journey_practice_completion_time_trigger
BEFORE INSERT ON journey_practice_completion
FOR EACH ROW EXECUTE FUNCTION lifeos_validate_practice_completion();

REVOKE ALL PRIVILEGES ON TABLE
  journey_capability_decision,
  journey_practice_session,
  journey_practice_completion
FROM PUBLIC;

DO $lifeos$
DECLARE
  role_name text;
BEGIN
  FOR role_name IN
    SELECT rolname
      FROM pg_roles
     WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE journey_capability_decision, journey_practice_session, journey_practice_completion FROM %I',
      role_name
    );
  END LOOP;
END
$lifeos$;

COMMIT;
