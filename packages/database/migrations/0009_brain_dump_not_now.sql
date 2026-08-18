BEGIN;

CREATE TABLE IF NOT EXISTS brain_dump_classification (
  brain_dump_classification_id text PRIMARY KEY
    CHECK (length(btrim(brain_dump_classification_id)) > 0),
  capture_id text NOT NULL,
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  category text NOT NULL CHECK (category IN (
    'GOAL', 'IDEA', 'PROBLEM', 'EMOTION', 'PERSON', 'CONCERN', 'TASK',
    'LEARNING', 'TRAVEL', 'CONTENT', 'CAREER', 'DIET', 'NOT_NOW'
  )),
  status text NOT NULL CHECK (status IN ('CURRENT', 'SUPERSEDED')),
  confirmed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  ended_at timestamptz,
  supersedes_classification_id text,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE (brain_dump_classification_id, user_id),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (capture_id, user_id)
    REFERENCES capture_record(capture_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_classification_id, user_id)
    REFERENCES brain_dump_classification(brain_dump_classification_id, user_id)
    ON DELETE RESTRICT,
  CHECK (recorded_at >= confirmed_at),
  CHECK (
    (status = 'CURRENT' AND ended_at IS NULL)
    OR (status = 'SUPERSEDED' AND ended_at IS NOT NULL AND ended_at >= recorded_at)
  ),
  CHECK (
    supersedes_classification_id IS NULL
    OR supersedes_classification_id <> brain_dump_classification_id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS brain_dump_classification_one_current_idx
  ON brain_dump_classification (user_id, capture_id)
  WHERE status = 'CURRENT';

CREATE INDEX IF NOT EXISTS brain_dump_classification_user_history_idx
  ON brain_dump_classification (
    user_id,
    capture_id,
    confirmed_at DESC,
    brain_dump_classification_id
  );

CREATE INDEX IF NOT EXISTS brain_dump_classification_capture_fk_idx
  ON brain_dump_classification (capture_id, user_id);

CREATE INDEX IF NOT EXISTS brain_dump_classification_supersession_fk_idx
  ON brain_dump_classification (supersedes_classification_id, user_id)
  WHERE supersedes_classification_id IS NOT NULL;

ALTER TABLE brain_dump_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_dump_classification FORCE ROW LEVEL SECURITY;

CREATE POLICY brain_dump_classification_user_policy ON brain_dump_classification
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

CREATE TABLE IF NOT EXISTS not_now_item (
  not_now_item_id text PRIMARY KEY CHECK (length(btrim(not_now_item_id)) > 0),
  root_id text NOT NULL CHECK (length(btrim(root_id)) > 0),
  revision integer NOT NULL CHECK (revision > 0),
  capture_id text NOT NULL,
  brain_dump_classification_id text NOT NULL,
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  assessment text NOT NULL CHECK (assessment IN (
    'TEMPORARY_INSPIRATION',
    'WORTH_RESEARCHING',
    'GENUINE_DIRECTION_CHANGE',
    'EMOTIONAL_REACTION',
    'UNSURE'
  )),
  posture text NOT NULL CHECK (posture IN (
    'PARK_IT',
    'RESEARCH_WITHOUT_COMMITTING',
    'DELAY_DECISION'
  )),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN (
    'PARKED_NOT_NOW',
    'RESEARCHING',
    'DELAYED',
    'DISMISSED',
    'RELEASED_FOR_REVIEW'
  )),
  status text NOT NULL CHECK (status IN ('CURRENT', 'SUPERSEDED')),
  review_note text CHECK (
    review_note IS NULL
    OR (length(btrim(review_note)) > 0 AND char_length(review_note) <= 4000)
  ),
  decided_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  ended_at timestamptz,
  supersedes_not_now_item_id text,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE (not_now_item_id, user_id),
  UNIQUE (root_id, user_id, revision),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (capture_id, user_id)
    REFERENCES capture_record(capture_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (brain_dump_classification_id, user_id)
    REFERENCES brain_dump_classification(brain_dump_classification_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_not_now_item_id, user_id)
    REFERENCES not_now_item(not_now_item_id, user_id)
    ON DELETE RESTRICT,
  CHECK (recorded_at >= decided_at),
  CHECK (
    (status = 'CURRENT' AND ended_at IS NULL)
    OR (status = 'SUPERSEDED' AND ended_at IS NOT NULL AND ended_at >= recorded_at)
  ),
  CHECK (
    (revision = 1 AND root_id = not_now_item_id AND supersedes_not_now_item_id IS NULL)
    OR (revision > 1 AND supersedes_not_now_item_id IS NOT NULL)
  ),
  CHECK (
    supersedes_not_now_item_id IS NULL
    OR supersedes_not_now_item_id <> not_now_item_id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS not_now_item_one_current_per_root_idx
  ON not_now_item (user_id, root_id)
  WHERE status = 'CURRENT';

CREATE UNIQUE INDEX IF NOT EXISTS not_now_item_one_current_per_capture_idx
  ON not_now_item (user_id, capture_id)
  WHERE status = 'CURRENT';

CREATE INDEX IF NOT EXISTS not_now_item_user_current_idx
  ON not_now_item (user_id, decided_at DESC, not_now_item_id)
  WHERE status = 'CURRENT';

CREATE INDEX IF NOT EXISTS not_now_item_capture_fk_idx
  ON not_now_item (capture_id, user_id);

CREATE INDEX IF NOT EXISTS not_now_item_classification_fk_idx
  ON not_now_item (brain_dump_classification_id, user_id);

CREATE INDEX IF NOT EXISTS not_now_item_supersession_fk_idx
  ON not_now_item (supersedes_not_now_item_id, user_id)
  WHERE supersedes_not_now_item_id IS NOT NULL;

ALTER TABLE not_now_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE not_now_item FORCE ROW LEVEL SECURITY;

CREATE POLICY not_now_item_user_policy ON not_now_item
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

REVOKE ALL PRIVILEGES ON TABLE brain_dump_classification, not_now_item FROM PUBLIC;

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
      'REVOKE ALL PRIVILEGES ON TABLE brain_dump_classification, not_now_item FROM %I',
      role_name
    );
  END LOOP;
END
$lifeos$;

COMMIT;
