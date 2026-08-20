BEGIN;

-- The user-scope function is intentionally SECURITY INVOKER. Give it an empty,
-- immutable search path because it only reads a custom setting and needs no objects.
CREATE OR REPLACE FUNCTION lifeos_current_user_id()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $lifeos$
  SELECT NULLIF(current_setting('lifeos.user_id', true), '')
$lifeos$;

REVOKE ALL PRIVILEGES ON FUNCTION lifeos_current_user_id() FROM PUBLIC;

-- Trigger functions use reviewed objects in the migration schema. Pin the search path and remove
-- direct API-role execution; PostgreSQL triggers retain their own invocation path.
DO $lifeos$
DECLARE
  schema_name constant text := current_schema();
BEGIN
  EXECUTE format(
    'ALTER FUNCTION %I.lifeos_enforce_one_open_practice_session() SET search_path = %I',
    schema_name,
    schema_name
  );
  EXECUTE format(
    'ALTER FUNCTION %I.lifeos_validate_practice_completion() SET search_path = %I',
    schema_name,
    schema_name
  );
  EXECUTE format(
    'ALTER FUNCTION %I.lifeos_validate_memory_revision() SET search_path = %I',
    schema_name,
    schema_name
  );
END
$lifeos$;

REVOKE ALL PRIVILEGES ON FUNCTION lifeos_enforce_one_open_practice_session() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION lifeos_validate_practice_completion() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION lifeos_validate_memory_revision() FROM PUBLIC;

-- Supabase defaults may auto-grant public-schema objects to browser/API roles. Life OS
-- is API-only: user sessions cross the HTTP boundary and the NOBYPASSRLS application
-- role is the only ordinary SQL identity. Remove present and future direct authority.
DO $lifeos$
DECLARE
  role_name text;
  table_name text;
  schema_name constant text := current_schema();
  private_tables constant text[] := ARRAY[
    'capture_record',
    'routing_interpretation',
    'routing_proposal',
    'calendar_event',
    'domain_event',
    'applied_proposal',
    'proposal_rejection',
    'direction_decision',
    'daily_log_entry',
    'daily_return_review',
    'brain_dump_classification',
    'not_now_item',
    'drift_occurrence',
    'drift_decision',
    'journey_capability_decision',
    'journey_practice_session',
    'journey_practice_completion',
    'periodic_review',
    'memory_item'
  ];
BEGIN
  EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM PUBLIC', schema_name);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC',
    schema_name
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC',
    schema_name
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC',
    schema_name
  );

  FOREACH table_name IN ARRAY private_tables
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC', schema_name, table_name);
  END LOOP;

  FOR role_name IN
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM %I', schema_name, role_name);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON TABLES FROM %I',
      schema_name,
      role_name
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
      schema_name,
      role_name
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
      schema_name,
      role_name
    );

    FOREACH table_name IN ARRAY private_tables
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
        schema_name,
        table_name,
        role_name
      );
    END LOOP;

    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION lifeos_current_user_id() FROM %I', role_name);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION lifeos_enforce_one_open_practice_session() FROM %I',
      role_name
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION lifeos_validate_practice_completion() FROM %I',
      role_name
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION lifeos_validate_memory_revision() FROM %I',
      role_name
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifeos_app') THEN
    GRANT EXECUTE ON FUNCTION lifeos_current_user_id() TO lifeos_app;
  END IF;
END
$lifeos$;

-- Index every currently unindexed foreign-key lookup used during restricted updates,
-- supersession, rejection, and parent-row checks.
CREATE INDEX IF NOT EXISTS direction_decision_supersedes_fk_idx
  ON direction_decision (supersedes_direction_id, user_id)
  WHERE supersedes_direction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS proposal_rejection_proposal_fk_idx
  ON proposal_rejection (proposal_id, user_id);

CREATE INDEX IF NOT EXISTS routing_proposal_applied_event_fk_idx
  ON routing_proposal (applied_event_id)
  WHERE applied_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS routing_proposal_capture_fk_idx
  ON routing_proposal (capture_id, user_id);

CREATE INDEX IF NOT EXISTS routing_proposal_interpretation_fk_idx
  ON routing_proposal (interpretation_id, capture_id, user_id);

COMMIT;
