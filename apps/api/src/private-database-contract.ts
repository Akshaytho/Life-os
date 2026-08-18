export const requiredPrivateTables = [
  "capture_record",
  "routing_interpretation",
  "routing_proposal",
  "calendar_event",
  "domain_event",
  "applied_proposal",
  "proposal_rejection",
] as const;

export const migrationLedgerTable = "lifeos_schema_migration" as const;
export const userScopeFunction = "lifeos_current_user_id" as const;

export const requiredApplicationTablePrivileges = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
export const forbiddenApplicationTablePrivileges = ["TRUNCATE", "REFERENCES", "TRIGGER"] as const;

/**
 * Direction is a separate high-authority capability, not another ordinary CRUD table.
 * The live application needs read + append + supersession authority, but never DELETE.
 */
export const directionDecisionTable = "direction_decision" as const;
export const requiredDirectionApplicationTablePrivileges = ["SELECT", "INSERT", "UPDATE"] as const;
export const forbiddenDirectionApplicationTablePrivileges = ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;

/**
 * Journey activation is also decision history: current rows may be superseded, but the
 * application cannot delete historical Journey decisions.
 */
export const journeyDecisionTable = "journey_decision" as const;
export const requiredJourneyApplicationTablePrivileges = ["SELECT", "INSERT", "UPDATE"] as const;
export const forbiddenJourneyApplicationTablePrivileges = ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
