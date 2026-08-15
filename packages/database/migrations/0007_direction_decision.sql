BEGIN;

CREATE TABLE IF NOT EXISTS direction_decision (
  direction_id text PRIMARY KEY CHECK (length(btrim(direction_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  statement text NOT NULL CHECK (
    length(btrim(statement)) > 0 AND char_length(statement) <= 1200
  ),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'REVOKED')),
  decided_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  ended_at timestamptz,
  supersedes_direction_id text,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE (direction_id, user_id),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (supersedes_direction_id, user_id)
    REFERENCES direction_decision(direction_id, user_id)
    ON DELETE RESTRICT,
  CHECK (recorded_at >= decided_at),
  CHECK (
    (status = 'ACTIVE' AND ended_at IS NULL)
    OR (status IN ('SUPERSEDED', 'REVOKED') AND ended_at IS NOT NULL)
  ),
  CHECK (supersedes_direction_id IS NULL OR supersedes_direction_id <> direction_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS direction_decision_one_active_per_user_idx
  ON direction_decision (user_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS direction_decision_user_history_idx
  ON direction_decision (user_id, decided_at DESC, direction_id);

ALTER TABLE direction_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE direction_decision FORCE ROW LEVEL SECURITY;

CREATE POLICY direction_decision_user_policy ON direction_decision
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

COMMIT;
