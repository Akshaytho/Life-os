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
