BEGIN;

CREATE TABLE IF NOT EXISTS drift_occurrence (
  drift_id text PRIMARY KEY CHECK (length(btrim(drift_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  source_note text CHECK (
    source_note IS NULL
    OR (length(btrim(source_note)) > 0 AND char_length(source_note) <= 4000)
  ),
  source text NOT NULL CHECK (source IN ('WEB_APP', 'MCP', 'SCHEDULED_JOB', 'AI_CHAT', 'IMPORT')),
  correlation_id text NOT NULL CHECK (length(btrim(correlation_id)) > 0),
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  UNIQUE (drift_id, user_id),
  UNIQUE (user_id, request_id),
  CHECK (recorded_at >= occurred_at)
);

CREATE INDEX IF NOT EXISTS drift_occurrence_user_time_idx
  ON drift_occurrence (user_id, occurred_at DESC, drift_id);

ALTER TABLE drift_occurrence ENABLE ROW LEVEL SECURITY;
ALTER TABLE drift_occurrence FORCE ROW LEVEL SECURITY;

CREATE POLICY drift_occurrence_user_policy ON drift_occurrence
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

CREATE TABLE IF NOT EXISTS drift_decision (
  drift_decision_id text PRIMARY KEY CHECK (length(btrim(drift_decision_id)) > 0),
  root_decision_id text NOT NULL CHECK (length(btrim(root_decision_id)) > 0),
  revision integer NOT NULL CHECK (revision > 0),
  drift_id text NOT NULL,
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  explanation text NOT NULL CHECK (explanation IN (
    'TEMPORARY_INSPIRATION',
    'COMPARISON',
    'AVOIDANCE',
    'EMOTIONAL_REACTION',
    'GENUINE_RECONSIDERATION',
    'UNSURE'
  )),
  trigger_note text CHECK (
    trigger_note IS NULL
    OR (length(btrim(trigger_note)) > 0 AND char_length(trigger_note) <= 2000)
  ),
  emotion_note text CHECK (
    emotion_note IS NULL
    OR (length(btrim(emotion_note)) > 0 AND char_length(emotion_note) <= 2000)
  ),
  distraction_note text CHECK (
    distraction_note IS NULL
    OR (length(btrim(distraction_note)) > 0 AND char_length(distraction_note) <= 2000)
  ),
  return_posture text CHECK (return_posture IS NULL OR return_posture IN (
    'STILL_RETURNING',
    'RETURN_TO_DIRECTION',
    'PARK_IDEA',
    'REFLECT_ONLY',
    'ADJUST_PLAN',
    'DELIBERATE_RECONSIDERATION'
  )),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN (
    'UNDERSTOOD',
    'STILL_RETURNING',
    'RESOLVED'
  )),
  status text NOT NULL CHECK (status IN ('CURRENT', 'SUPERSEDED')),
  authority_class text NOT NULL CHECK (authority_class = 'DECISION'),
  decided_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  ended_at timestamptz,
  supersedes_drift_decision_id text,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE (drift_decision_id, user_id),
  UNIQUE (root_decision_id, user_id, revision),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (drift_id, user_id)
    REFERENCES drift_occurrence(drift_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_drift_decision_id, user_id)
    REFERENCES drift_decision(drift_decision_id, user_id)
    ON DELETE RESTRICT,
  CHECK (recorded_at >= decided_at),
  CHECK (
    (status = 'CURRENT' AND ended_at IS NULL)
    OR (status = 'SUPERSEDED' AND ended_at IS NOT NULL AND ended_at >= recorded_at)
  ),
  CHECK (
    (revision = 1 AND root_decision_id = drift_decision_id AND supersedes_drift_decision_id IS NULL)
    OR (revision > 1 AND supersedes_drift_decision_id IS NOT NULL)
  ),
  CHECK (
    supersedes_drift_decision_id IS NULL
    OR supersedes_drift_decision_id <> drift_decision_id
  ),
  CHECK (
    (return_posture IS NULL AND lifecycle_state = 'UNDERSTOOD')
    OR (return_posture = 'STILL_RETURNING' AND lifecycle_state = 'STILL_RETURNING')
    OR (
      return_posture IS NOT NULL
      AND return_posture <> 'STILL_RETURNING'
      AND lifecycle_state = 'RESOLVED'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS drift_decision_one_current_idx
  ON drift_decision (user_id, drift_id)
  WHERE status = 'CURRENT';

CREATE INDEX IF NOT EXISTS drift_decision_user_current_idx
  ON drift_decision (user_id, decided_at DESC, drift_decision_id)
  WHERE status = 'CURRENT';

CREATE INDEX IF NOT EXISTS drift_decision_drift_fk_idx
  ON drift_decision (drift_id, user_id);

CREATE INDEX IF NOT EXISTS drift_decision_supersession_fk_idx
  ON drift_decision (supersedes_drift_decision_id, user_id)
  WHERE supersedes_drift_decision_id IS NOT NULL;

ALTER TABLE drift_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE drift_decision FORCE ROW LEVEL SECURITY;

CREATE POLICY drift_decision_user_policy ON drift_decision
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

REVOKE ALL PRIVILEGES ON TABLE drift_occurrence, drift_decision FROM PUBLIC;

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
      'REVOKE ALL PRIVILEGES ON TABLE drift_occurrence, drift_decision FROM %I',
      role_name
    );
  END LOOP;
END
$lifeos$;

COMMIT;
