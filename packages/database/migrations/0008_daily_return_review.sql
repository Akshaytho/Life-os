BEGIN;

CREATE TABLE IF NOT EXISTS daily_log_entry (
  daily_log_entry_id text PRIMARY KEY CHECK (length(btrim(daily_log_entry_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  local_date date NOT NULL,
  time_zone varchar(100) NOT NULL CHECK (length(btrim(time_zone)) > 0),
  body text NOT NULL CHECK (
    length(btrim(body)) > 0 AND char_length(body) <= 4000
  ),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE (daily_log_entry_id, user_id),
  UNIQUE (user_id, request_id),
  CHECK (recorded_at >= occurred_at)
);

CREATE INDEX IF NOT EXISTS daily_log_entry_user_date_time_idx
  ON daily_log_entry (user_id, local_date, occurred_at, daily_log_entry_id);

ALTER TABLE daily_log_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_log_entry FORCE ROW LEVEL SECURITY;

CREATE POLICY daily_log_entry_user_policy ON daily_log_entry
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

CREATE TABLE IF NOT EXISTS daily_return_review (
  daily_return_review_id text PRIMARY KEY CHECK (length(btrim(daily_return_review_id)) > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  local_date date NOT NULL,
  time_zone varchar(100) NOT NULL CHECK (length(btrim(time_zone)) > 0),
  what_happened text NOT NULL CHECK (
    length(btrim(what_happened)) > 0 AND char_length(what_happened) <= 4000
  ),
  what_moved_forward text NOT NULL CHECK (
    length(btrim(what_moved_forward)) > 0 AND char_length(what_moved_forward) <= 4000
  ),
  what_pulled_me_away text NOT NULL CHECK (
    length(btrim(what_pulled_me_away)) > 0 AND char_length(what_pulled_me_away) <= 4000
  ),
  return_to_tomorrow text NOT NULL CHECK (
    length(btrim(return_to_tomorrow)) > 0 AND char_length(return_to_tomorrow) <= 4000
  ),
  return_state text NOT NULL CHECK (
    return_state IN ('RETURNED', 'STILL_RETURNING', 'NO_DRIFT_NOTICED')
  ),
  status text NOT NULL CHECK (status IN ('CURRENT', 'SUPERSEDED')),
  submitted_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  ended_at timestamptz,
  supersedes_review_id text,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE (daily_return_review_id, user_id),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (supersedes_review_id, user_id)
    REFERENCES daily_return_review(daily_return_review_id, user_id)
    ON DELETE RESTRICT,
  CHECK (recorded_at >= submitted_at),
  CHECK (
    (status = 'CURRENT' AND ended_at IS NULL)
    OR (status = 'SUPERSEDED' AND ended_at IS NOT NULL AND ended_at >= recorded_at)
  ),
  CHECK (supersedes_review_id IS NULL OR supersedes_review_id <> daily_return_review_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_return_review_one_current_per_user_date_idx
  ON daily_return_review (user_id, local_date)
  WHERE status = 'CURRENT';

CREATE INDEX IF NOT EXISTS daily_return_review_user_date_history_idx
  ON daily_return_review (user_id, local_date, submitted_at DESC, daily_return_review_id);

CREATE INDEX IF NOT EXISTS daily_return_review_supersession_fk_idx
  ON daily_return_review (supersedes_review_id, user_id)
  WHERE supersedes_review_id IS NOT NULL;

ALTER TABLE daily_return_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_return_review FORCE ROW LEVEL SECURITY;

CREATE POLICY daily_return_review_user_policy ON daily_return_review
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

COMMIT;
