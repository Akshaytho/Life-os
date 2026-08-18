BEGIN;

CREATE TABLE IF NOT EXISTS memory_item (
  memory_item_id text PRIMARY KEY CHECK (length(btrim(memory_item_id)) > 0),
  root_id text NOT NULL CHECK (length(btrim(root_id)) > 0),
  revision integer NOT NULL CHECK (revision > 0),
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  kind text NOT NULL CHECK (kind IN (
    'LEARNING', 'EXPERIENCE', 'REFLECTION', 'PERSON_CONTEXT', 'DECISION_HISTORY'
  )),
  title text NOT NULL CHECK (length(btrim(title)) > 0 AND char_length(title) <= 200),
  body text NOT NULL CHECK (length(btrim(body)) > 0 AND char_length(body) <= 4000),
  authority_class text NOT NULL CHECK (authority_class = 'REFLECTION'),
  source_domain text NOT NULL CHECK (source_domain IN ('PERIODIC_REVIEW', 'JOURNEY_PRACTICE')),
  source_entity_id text NOT NULL CHECK (length(btrim(source_entity_id)) > 0),
  source_occurred_at timestamptz NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('NEW', 'REINFORCES', 'MODIFIES', 'CONTRADICTS')),
  related_root_id text,
  status text NOT NULL CHECK (status IN ('CURRENT', 'SUPERSEDED')),
  retained_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  ended_at timestamptz,
  supersedes_memory_item_id text,
  request_id text NOT NULL CHECK (length(btrim(request_id)) > 0),
  request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  UNIQUE (memory_item_id, user_id),
  UNIQUE (root_id, user_id, revision),
  UNIQUE (user_id, request_id),
  FOREIGN KEY (supersedes_memory_item_id, user_id)
    REFERENCES memory_item(memory_item_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (related_root_id, user_id)
    REFERENCES memory_item(memory_item_id, user_id) ON DELETE RESTRICT,
  CHECK (recorded_at >= retained_at),
  CHECK (
    (revision = 1 AND root_id = memory_item_id AND supersedes_memory_item_id IS NULL)
    OR (revision > 1 AND root_id <> memory_item_id AND supersedes_memory_item_id IS NOT NULL)
  ),
  CHECK (
    (relationship = 'NEW' AND related_root_id IS NULL)
    OR (relationship <> 'NEW' AND related_root_id IS NOT NULL AND related_root_id <> root_id)
  ),
  CHECK (
    (status = 'CURRENT' AND ended_at IS NULL)
    OR (status = 'SUPERSEDED' AND ended_at IS NOT NULL AND ended_at >= recorded_at)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS memory_item_one_current_root_idx
  ON memory_item (user_id, root_id) WHERE status = 'CURRENT';

CREATE UNIQUE INDEX IF NOT EXISTS memory_item_one_current_source_idx
  ON memory_item (user_id, source_domain, source_entity_id) WHERE status = 'CURRENT';

CREATE INDEX IF NOT EXISTS memory_item_user_recall_idx
  ON memory_item (user_id, status, source_occurred_at DESC, root_id);

CREATE INDEX IF NOT EXISTS memory_item_supersession_fk_idx
  ON memory_item (supersedes_memory_item_id, user_id)
  WHERE supersedes_memory_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS memory_item_related_root_fk_idx
  ON memory_item (related_root_id, user_id) WHERE related_root_id IS NOT NULL;

CREATE OR REPLACE FUNCTION lifeos_validate_memory_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $lifeos$
DECLARE
  prior_revision integer;
  prior_root text;
  related_revision integer;
  related_identity text;
BEGIN
  IF NEW.revision > 1 THEN
    SELECT revision, root_id INTO prior_revision, prior_root
      FROM memory_item
     WHERE memory_item_id = NEW.supersedes_memory_item_id
       AND user_id = NEW.user_id;
    IF prior_revision IS NULL
      OR prior_root <> NEW.root_id
      OR prior_revision + 1 <> NEW.revision THEN
      RAISE EXCEPTION 'invalid Memory revision chain' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.related_root_id IS NOT NULL THEN
    SELECT revision, root_id INTO related_revision, related_identity
      FROM memory_item
     WHERE memory_item_id = NEW.related_root_id
       AND user_id = NEW.user_id;
    IF related_revision <> 1 OR related_identity <> NEW.related_root_id THEN
      RAISE EXCEPTION 'Memory relationship must target a root identity' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$lifeos$;

REVOKE ALL PRIVILEGES ON FUNCTION lifeos_validate_memory_revision() FROM PUBLIC;

CREATE TRIGGER memory_item_revision_chain_trigger
BEFORE INSERT ON memory_item
FOR EACH ROW EXECUTE FUNCTION lifeos_validate_memory_revision();

ALTER TABLE memory_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_item FORCE ROW LEVEL SECURITY;

CREATE POLICY memory_item_user_policy ON memory_item
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

REVOKE ALL PRIVILEGES ON TABLE memory_item FROM PUBLIC;

DO $lifeos$
DECLARE
  role_name text;
BEGIN
  FOR role_name IN
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE memory_item FROM %I', role_name);
  END LOOP;
END
$lifeos$;

COMMIT;
