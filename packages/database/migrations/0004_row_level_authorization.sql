BEGIN;

CREATE OR REPLACE FUNCTION lifeos_current_user_id()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('lifeos.user_id', true), '')
$$;

ALTER TABLE capture_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_record FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS capture_record_owner ON capture_record;
CREATE POLICY capture_record_owner ON capture_record
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

ALTER TABLE routing_interpretation ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_interpretation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS routing_interpretation_owner ON routing_interpretation;
CREATE POLICY routing_interpretation_owner ON routing_interpretation
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

ALTER TABLE routing_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_proposal FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS routing_proposal_owner ON routing_proposal;
CREATE POLICY routing_proposal_owner ON routing_proposal
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

ALTER TABLE calendar_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_event_owner ON calendar_event;
CREATE POLICY calendar_event_owner ON calendar_event
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

ALTER TABLE domain_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS domain_event_owner ON domain_event;
CREATE POLICY domain_event_owner ON domain_event
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

ALTER TABLE applied_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE applied_proposal FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS applied_proposal_owner ON applied_proposal;
CREATE POLICY applied_proposal_owner ON applied_proposal
  USING (
    confirmed_by_actor_id = lifeos_current_user_id()
    AND EXISTS (
      SELECT 1
        FROM routing_proposal rp
       WHERE rp.proposal_id = applied_proposal.proposal_id
         AND rp.user_id = lifeos_current_user_id()
    )
  )
  WITH CHECK (
    confirmed_by_actor_id = lifeos_current_user_id()
    AND EXISTS (
      SELECT 1
        FROM routing_proposal rp
       WHERE rp.proposal_id = applied_proposal.proposal_id
         AND rp.user_id = lifeos_current_user_id()
    )
  );

COMMIT;
