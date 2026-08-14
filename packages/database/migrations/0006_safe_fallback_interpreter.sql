BEGIN;

ALTER TABLE routing_interpretation
  DROP CONSTRAINT IF EXISTS routing_interpretation_interpreter_check;

ALTER TABLE routing_interpretation
  ADD CONSTRAINT routing_interpretation_interpreter_check
  CHECK (interpreter IN ('LOCAL_SAMPLE', 'SAFE_FALLBACK', 'LIFE_OS_AI'));

COMMIT;
