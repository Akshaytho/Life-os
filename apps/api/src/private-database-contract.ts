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
 * Daily Return is an opt-in reflection capability. Daily Log entries are append-only;
 * review revisions additionally need UPDATE so the current revision can be superseded.
 */
export const dailyLogEntryTable = "daily_log_entry" as const;
export const dailyReturnReviewTable = "daily_return_review" as const;
export const requiredDailyLogApplicationTablePrivileges = ["SELECT", "INSERT"] as const;
export const forbiddenDailyLogApplicationTablePrivileges = ["UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
export const requiredDailyReviewApplicationTablePrivileges = ["SELECT", "INSERT", "UPDATE"] as const;
export const forbiddenDailyReviewApplicationTablePrivileges = ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
