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

/**
 * Brain Dump classification and NOT NOW review are separately activated. Both
 * tables preserve revisions by INSERT + supersession UPDATE; DELETE is never needed.
 */
export const brainDumpClassificationTable = "brain_dump_classification" as const;
export const notNowItemTable = "not_now_item" as const;
export const requiredBrainDumpNotNowApplicationTablePrivileges = ["SELECT", "INSERT", "UPDATE"] as const;
export const forbiddenBrainDumpNotNowApplicationTablePrivileges = ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;

/**
 * Drift occurrences are immutable source rows; decision revisions use INSERT +
 * supersession UPDATE. The separate capability never receives destructive authority.
 */
export const driftOccurrenceTable = "drift_occurrence" as const;
export const driftDecisionTable = "drift_decision" as const;
export const requiredDriftOccurrenceApplicationTablePrivileges = ["SELECT", "INSERT"] as const;
export const forbiddenDriftOccurrenceApplicationTablePrivileges = ["UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
export const requiredDriftDecisionApplicationTablePrivileges = ["SELECT", "INSERT", "UPDATE"] as const;
export const forbiddenDriftDecisionApplicationTablePrivileges = ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;

/**
 * Journey activation and practice evidence are append-only. Completion is a
 * separate fact row, so the capability never needs UPDATE or DELETE.
 */
export const journeyCapabilityDecisionTable = "journey_capability_decision" as const;
export const journeyPracticeSessionTable = "journey_practice_session" as const;
export const journeyPracticeCompletionTable = "journey_practice_completion" as const;
export const requiredJourneyPracticeApplicationTablePrivileges = ["SELECT", "INSERT"] as const;
export const forbiddenJourneyPracticeApplicationTablePrivileges = ["UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;

/**
 * Periodic review revisions use INSERT + supersession UPDATE. Source domains remain
 * read-only through their existing capabilities; review history is never deleted.
 */
export const periodicReviewTable = "periodic_review" as const;
export const requiredPeriodicReviewApplicationTablePrivileges = ["SELECT", "INSERT", "UPDATE"] as const;
export const forbiddenPeriodicReviewApplicationTablePrivileges = ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
