import type {
  ApprovalMode,
  CertaintySignal,
  ProposedOperation,
  RoutingDestination,
  RoutingIntent,
  RoutingObservation,
  RoutingTrustClass,
} from "../contracts/input-routing";

export type PersistableProposalState = "PROPOSED" | "NEEDS_CONFIRMATION" | "READY_TO_APPLY" | "REJECTED";

export interface InterpretedRoutingProposal {
  /** Interpreter-local key for traceability only. The backend generates the durable proposal ID. */
  key: string;
  destination: RoutingDestination;
  operation: ProposedOperation;
  summary: string;
  targetTrustClass: RoutingTrustClass;
  approvalMode: ApprovalMode;
  state: PersistableProposalState;
  reason: string;
  payloadJson: Record<string, unknown>;
}

export interface CaptureInterpretationResult {
  interpreter: "LOCAL_SAMPLE" | "LIFE_OS_AI";
  intent: RoutingIntent;
  certainty: CertaintySignal;
  confidence: number;
  observations: RoutingObservation[];
  proposals: InterpretedRoutingProposal[];
  clarification?: string;
}

export interface CaptureInterpreterInput {
  rawText: string;
  receivedAt: string;
}

export interface CaptureInterpreter {
  interpret(input: CaptureInterpreterInput): Promise<CaptureInterpretationResult>;
}
