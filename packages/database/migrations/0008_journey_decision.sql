BEGIN;

CREATE TABLE IF NOT EXISTS journey_decision (
  journey_id text PRIMARY KEY CHECK (length(btrim(journey_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  name text NOT NULL CHECK (
    length(btrim(name)) > 0 AND char_length(name) <= 240
  ),
  active_capability text NOT NULL CHECK (
    length(btrim(active_capability)) > 0 AND char_length(active_capability) <= 240
  ),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'REVOKED')),
  decided_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  ended_at timestamptz,
  supersedes_journey_id text,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE (journey_id, user_id),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (supersedes_journey_id, user_id)
    REFERENCES journey_decision(journey_id, user_id)
    ON DELETE RESTRICT,
  CHECK (recorded_at >= decided_at),
  CHECK (
    (status = 'ACTIVE' AND ended_at IS NULL)
    OR (status IN ('SUPERSEDED', 'REVOKED') AND ended_at IS NOT NULL)
  ),
  CHECK (supersedes_journey_id IS NULL OR supersedes_journey_id <> journey_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS journey_decision_one_active_per_user_idx
  ON journey_decision (user_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS journey_decision_user_history_idx
  ON journey_decision (user_id, decided_at DESC, journey_id);

ALTER TABLE journey_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_decision FORCE ROW LEVEL SECURITY;

CREATE POLICY journey_decision_user_policy ON journey_decision
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

COMMIT;
