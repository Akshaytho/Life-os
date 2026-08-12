BEGIN;

ALTER TABLE capture_record
  ADD COLUMN IF NOT EXISTS request_id text;

UPDATE capture_record
   SET request_id = 'legacy:' || capture_id
 WHERE request_id IS NULL;

ALTER TABLE capture_record
  ALTER COLUMN request_id SET NOT NULL;

ALTER TABLE capture_record
  ADD CONSTRAINT capture_record_request_id_nonempty
  CHECK (length(btrim(request_id)) > 0);

CREATE UNIQUE INDEX IF NOT EXISTS capture_record_user_request_uq
  ON capture_record (user_id, request_id);

CREATE TABLE IF NOT EXISTS routing_interpretation (
  interpretation_id text PRIMARY KEY CHECK (length(btrim(interpretation_id)) > 0),
  capture_id text NOT NULL,
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  version integer NOT NULL CHECK (version > 0),
  interpreter text NOT NULL CHECK (interpreter IN ('LOCAL_SAMPLE', 'LIFE_OS_AI')),
  intent text NOT NULL CHECK (intent IN (
    'DATED_PLAN', 'LEARNING', 'DIRECTION_RECONSIDERATION', 'HEALTH_OBSERVATION',
    'DRIFT_SIGNAL', 'RAW_THOUGHT', 'UNKNOWN'
  )),
  certainty text NOT NULL CHECK (certainty IN ('TENTATIVE', 'LIKELY', 'CONFIRMED', 'UNSPECIFIED')),
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  observations_json jsonb NOT NULL,
  clarification text,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (capture_id, user_id) REFERENCES capture_record(capture_id, user_id) ON DELETE RESTRICT,
  UNIQUE (capture_id, user_id, version),
  UNIQUE (interpretation_id, capture_id, user_id)
);

CREATE INDEX IF NOT EXISTS routing_interpretation_capture_idx
  ON routing_interpretation (user_id, capture_id, version DESC);

ALTER TABLE routing_proposal
  ADD COLUMN IF NOT EXISTS interpretation_id text,
  ADD COLUMN IF NOT EXISTS interpreter_proposal_key text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS target_trust_class text,
  ADD COLUMN IF NOT EXISTS reason text;

UPDATE routing_proposal
   SET interpreter_proposal_key = COALESCE(interpreter_proposal_key, 'legacy:' || proposal_id),
       summary = COALESCE(summary, 'Legacy persisted proposal'),
       target_trust_class = COALESCE(target_trust_class, 'SUGGESTION'),
       reason = COALESCE(reason, 'Persisted before interpretation provenance V1')
 WHERE interpreter_proposal_key IS NULL
    OR summary IS NULL
    OR target_trust_class IS NULL
    OR reason IS NULL;

ALTER TABLE routing_proposal
  ALTER COLUMN interpreter_proposal_key SET NOT NULL,
  ALTER COLUMN summary SET NOT NULL,
  ALTER COLUMN target_trust_class SET NOT NULL,
  ALTER COLUMN reason SET NOT NULL;

ALTER TABLE routing_proposal
  ADD CONSTRAINT routing_proposal_interpreter_key_nonempty
    CHECK (length(btrim(interpreter_proposal_key)) > 0),
  ADD CONSTRAINT routing_proposal_summary_nonempty
    CHECK (length(btrim(summary)) > 0),
  ADD CONSTRAINT routing_proposal_reason_nonempty
    CHECK (length(btrim(reason)) > 0),
  ADD CONSTRAINT routing_proposal_target_trust_class_check
    CHECK (target_trust_class IN ('FACT', 'REFLECTION', 'OBSERVATION', 'SUGGESTION', 'DECISION'));

ALTER TABLE routing_proposal
  DROP CONSTRAINT IF EXISTS routing_proposal_destination_check,
  DROP CONSTRAINT IF EXISTS routing_proposal_operation_check;

ALTER TABLE routing_proposal
  ADD CONSTRAINT routing_proposal_destination_check CHECK (destination IN (
    'TODAY', 'CALENDAR', 'JOURNEY', 'MEMORY', 'YOU', 'BRAIN_DUMP', 'DRIFT', 'NOT_NOW'
  )),
  ADD CONSTRAINT routing_proposal_operation_check CHECK (operation IN (
    'CREATE_CALENDAR_PLAN',
    'RECORD_LEARNING_EVIDENCE',
    'RECORD_MEMORY',
    'RECORD_REFLECTION',
    'RECORD_DECISION',
    'START_DRIFT_FLOW',
    'PARK_NOT_NOW',
    'PROPOSE_DIRECTION_RECONSIDERATION',
    'KEEP_RAW_CAPTURE'
  ));

ALTER TABLE routing_proposal
  ADD CONSTRAINT routing_proposal_interpretation_fk
  FOREIGN KEY (interpretation_id, capture_id, user_id)
  REFERENCES routing_interpretation(interpretation_id, capture_id, user_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS routing_proposal_interpretation_idx
  ON routing_proposal (interpretation_id, created_at);

COMMIT;
