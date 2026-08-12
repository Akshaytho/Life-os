BEGIN;

ALTER TABLE routing_proposal
  ADD CONSTRAINT routing_proposal_id_user_uq UNIQUE (proposal_id, user_id);

CREATE TABLE proposal_rejection (
  proposal_id text PRIMARY KEY,
  user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
  rejected_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  rejected_by_actor_id text NOT NULL CHECK (length(btrim(rejected_by_actor_id)) > 0),
  reason text,
  FOREIGN KEY (proposal_id, user_id)
    REFERENCES routing_proposal(proposal_id, user_id)
    ON DELETE RESTRICT,
  CHECK (rejected_by_actor_id = user_id),
  CHECK (recorded_at >= rejected_at),
  CHECK (reason IS NULL OR length(btrim(reason)) > 0)
);

CREATE INDEX proposal_rejection_user_time_idx
  ON proposal_rejection (user_id, rejected_at DESC);

ALTER TABLE proposal_rejection ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_rejection FORCE ROW LEVEL SECURITY;

CREATE POLICY proposal_rejection_owner_policy
  ON proposal_rejection
  FOR ALL
  USING (user_id = lifeos_current_user_id())
  WITH CHECK (user_id = lifeos_current_user_id());

COMMIT;
