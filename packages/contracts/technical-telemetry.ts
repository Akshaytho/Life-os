import type { RuntimeProvenance } from "./runtime-provenance";

export type TechnicalTelemetryLevel = "INFO" | "WARN" | "ERROR";
export type TechnicalTelemetryComponent = "API" | "APPLICATION" | "DATABASE" | "LIFE_OS_AI" | "MCP" | "SYSTEM";

export type TechnicalOperation =
  | "CAPTURE_AND_PROPOSE"
  | "GET_PROPOSAL_REVIEW"
  | "GET_CANONICAL_CALENDAR"
  | "GET_DIRECTION_OVERVIEW"
  | "SET_CURRENT_DIRECTION"
  | "GET_DAILY_RETURN_OVERVIEW"
  | "APPEND_DAILY_LOG_ENTRY"
  | "SUBMIT_DAILY_RETURN_REVIEW"
  | "GET_BRAIN_DUMP_OVERVIEW"
  | "CONFIRM_BRAIN_DUMP_CLASSIFICATION"
  | "GET_NOT_NOW_OVERVIEW"
  | "PARK_NOT_NOW_ITEM"
  | "REVIEW_NOT_NOW_ITEM"
  | "GET_DRIFT_OVERVIEW"
  | "RECORD_DRIFT"
  | "CONFIRM_DRIFT_UNDERSTANDING"
  | "RECORD_DRIFT_RETURN"
  | "GET_JOURNEY_PRACTICE_OVERVIEW"
  | "ACTIVATE_JOURNEY_CAPABILITY"
  | "START_JOURNEY_PRACTICE"
  | "COMPLETE_JOURNEY_PRACTICE"
  | "ASK_LIFE_OS"
  | "GET_PERIODIC_REVIEW_OVERVIEW"
  | "SUBMIT_PERIODIC_REVIEW"
  | "CONFIRM_CALENDAR_PROPOSAL"
  | "APPLY_CALENDAR_PROPOSAL"
  | "REJECT_ROUTING_PROPOSAL"
  | "GET_INTERACTION_TRACE"
  | "DATABASE_TRANSACTION";

export interface TechnicalTraceReferences {
  correlationId?: string;
  requestId?: string;
  captureId?: string;
  proposalId?: string;
  eventId?: string;
}

interface TechnicalTelemetryBase {
  timestamp: string;
  level: TechnicalTelemetryLevel;
  component: TechnicalTelemetryComponent;
  runtime: RuntimeProvenance;
}

export interface RuntimeLifecycleTelemetry extends TechnicalTelemetryBase {
  kind: "RUNTIME_LIFECYCLE";
  event: "STARTED" | "STOPPING" | "STARTUP_FAILED" | "SERVER_FAILED";
  signal?: "SIGTERM" | "SIGINT";
  errorCode?: string;
}

export interface OperationTelemetry extends TechnicalTelemetryBase {
  kind: "OPERATION";
  operation: TechnicalOperation;
  outcome: "SUCCESS" | "REJECTED" | "UNAVAILABLE" | "FAILED";
  durationMs: number;
  trace?: TechnicalTraceReferences;
  errorCode?: string;
}

export interface InterpreterTelemetry extends TechnicalTelemetryBase {
  kind: "INTERPRETER";
  interpreter: "LOCAL_SAMPLE" | "LIFE_OS_AI";
  outcome: "SUCCESS" | "FAILED";
  proposalCount?: number;
  confidenceBand?: "LOW" | "MEDIUM" | "HIGH";
  durationMs: number;
  trace?: Pick<TechnicalTraceReferences, "correlationId" | "requestId" | "captureId">;
  policyVersion?: string;
  modelName?: string;
  errorCode?: string;
}

/**
 * Developer/operations telemetry only. No variant permits raw user content,
 * arbitrary metadata bags, payload JSON, user IDs, credentials, or error messages.
 */
export type TechnicalTelemetryEvent = RuntimeLifecycleTelemetry | OperationTelemetry | InterpreterTelemetry;
