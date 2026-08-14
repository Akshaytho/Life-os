import type {
  ApprovalMode,
  CertaintySignal,
  ProposedOperation,
  RoutingDestination,
  RoutingIntent,
  RoutingInterpreter,
  RoutingObservation,
  RoutingTrustClass,
} from "../contracts/input-routing";

export type InterpreterProposalState = "PROPOSED" | "NEEDS_CONFIRMATION" | "READY_TO_APPLY";

export interface InterpretedRoutingProposal {
  /** Interpreter-local key for traceability only. The backend generates the durable proposal ID. */
  key: string;
  destination: RoutingDestination;
  operation: ProposedOperation;
  summary: string;
  targetTrustClass: RoutingTrustClass;
  approvalMode: ApprovalMode;
  state: InterpreterProposalState;
  reason: string;
  payloadJson: Record<string, unknown>;
}

export interface CaptureInterpretationResult {
  interpreter: RoutingInterpreter;
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
