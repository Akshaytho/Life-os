BEGIN;

CREATE TABLE IF NOT EXISTS periodic_review (
  periodic_review_id text PRIMARY KEY CHECK (length(btrim(periodic_review_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  period_kind text NOT NULL CHECK (period_kind IN ('WEEK', 'MONTH')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  time_zone text NOT NULL CHECK (length(btrim(time_zone)) > 0 AND char_length(time_zone) <= 100),
  what_mattered text NOT NULL CHECK (length(btrim(what_mattered)) > 0 AND char_length(what_mattered) <= 4000),
  what_changed text NOT NULL CHECK (length(btrim(what_changed)) > 0 AND char_length(what_changed) <= 4000),
  what_moved_forward text NOT NULL CHECK (length(btrim(what_moved_forward)) > 0 AND char_length(what_moved_forward) <= 4000),
  drift_and_return text NOT NULL CHECK (length(btrim(drift_and_return)) > 0 AND char_length(drift_and_return) <= 4000),
  what_was_learned text NOT NULL CHECK (length(btrim(what_was_learned)) > 0 AND char_length(what_was_learned) <= 4000),
  carry_forward text NOT NULL CHECK (length(btrim(carry_forward)) > 0 AND char_length(carry_forward) <= 4000),
  worth_preserving text CHECK (
    worth_preserving IS NULL
    OR (length(btrim(worth_preserving)) > 0 AND char_length(worth_preserving) <= 4000)
  ),
  authority_class text NOT NULL CHECK (authority_class = 'REFLECTION'),
  status text NOT NULL CHECK (status IN ('CURRENT', 'SUPERSEDED')),
  submitted_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  ended_at timestamptz,
  supersedes_review_id text,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE (periodic_review_id, user_id),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (supersedes_review_id, user_id)
    REFERENCES periodic_review(periodic_review_id, user_id)
    ON DELETE RESTRICT,
  CHECK (period_end >= period_start),
  CHECK (recorded_at >= submitted_at),
  CHECK (
    (status = 'CURRENT' AND ended_at IS NULL)
    OR (status = 'SUPERSEDED' AND ended_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS periodic_review_one_current_idx
  ON periodic_review (user_id, period_kind, period_start)
  WHERE status = 'CURRENT';

CREATE INDEX IF NOT EXISTS periodic_review_user_period_idx
  ON periodic_review (user_id, period_start DESC, period_kind, submitted_at DESC);

CREATE INDEX IF NOT EXISTS periodic_review_supersedes_fk_idx
  ON periodic_review (supersedes_review_id, user_id)
  WHERE supersedes_review_id IS NOT NULL;

ALTER TABLE periodic_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodic_review FORCE ROW LEVEL SECURITY;

CREATE POLICY periodic_review_user_policy ON periodic_review
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

REVOKE ALL PRIVILEGES ON TABLE periodic_review FROM PUBLIC;

DO $lifeos$
DECLARE
  role_name text;
BEGIN
  FOR role_name IN
    SELECT rolname
      FROM pg_roles
     WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE periodic_review FROM %I', role_name);
  END LOOP;
END
$lifeos$;

COMMIT;
