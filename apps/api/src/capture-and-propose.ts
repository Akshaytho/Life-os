import type {
  Clock,
  CaptureRecord,
  RoutingIdGenerator,
  RoutingPersistenceBundle,
  RoutingProposalRecord,
  WriteRequestContext,
  WriteUnitOfWork,
} from "../../../packages/domain/write-boundary";
import type {
  CaptureInterpretationResult,
  CaptureInterpreter,
  InterpretedRoutingProposal,
} from "../../../packages/intelligence/capture-interpreter";
import type { ProposedOperation, RoutingDestination } from "../../../packages/contracts/input-routing";

export class CaptureProposalPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureProposalPersistenceError";
  }
}

export interface CaptureAndProposeCommand { rawText: string; }
export interface CaptureAndProposeDependencies {
  unitOfWork: WriteUnitOfWork;
  interpreter: CaptureInterpreter;
  clock: Clock;
  ids: RoutingIdGenerator;
}
export interface CaptureAndProposeReceipt {
  captureId: string;
  correlationId: string;
  interpretationId: string;
  proposalIds: string[];
  proposalStates: RoutingProposalRecord["state"][];
  idempotentReplay: boolean;
}

const calendarCategories = new Set(["Work", "Creator", "Learning", "Health", "Family", "Friends", "Travel", "Personal", "Rest"]);
const calendarCommitments = new Set(["Fixed", "Important", "Flexible", "Optional"]);
const interpreterKinds = new Set(["LOCAL_SAMPLE", "LIFE_OS_AI"]);
const routingIntents = new Set(["DATED_PLAN", "LEARNING", "DIRECTION_RECONSIDERATION", "HEALTH_OBSERVATION", "DRIFT_SIGNAL", "RAW_THOUGHT", "UNKNOWN"]);
const certaintySignals = new Set(["TENTATIVE", "LIKELY", "CONFIRMED", "UNSPECIFIED"]);
const proposalStates = new Set(["PROPOSED", "NEEDS_CONFIRMATION", "READY_TO_APPLY"]);
const approvalModes = new Set(["REVIEW_AND_APPLY", "EXPLICIT_CONFIRMATION", "HIGH_AUTHORITY_APPROVAL"]);
const trustClasses = new Set(["FACT", "REFLECTION", "OBSERVATION", "SUGGESTION", "DECISION"]);

const operationOwners: Record<ProposedOperation, RoutingDestination[]> = {
  CREATE_CALENDAR_PLAN: ["CALENDAR"],
  RECORD_LEARNING_EVIDENCE: ["JOURNEY"],
  RECORD_MEMORY: ["MEMORY"],
  RECORD_REFLECTION: ["MEMORY", "YOU"],
  RECORD_DECISION: ["MEMORY", "YOU"],
  START_DRIFT_FLOW: ["DRIFT"],
  PARK_NOT_NOW: ["NOT_NOW"],
  PROPOSE_DIRECTION_RECONSIDERATION: ["YOU"],
  KEEP_RAW_CAPTURE: ["BRAIN_DUMP"],
};

function requireText(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new CaptureProposalPersistenceError(`${label} is required`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateReadyCalendarPayload(proposal: InterpretedRoutingProposal) {
  if (!isRecord(proposal.payloadJson)) throw new CaptureProposalPersistenceError("A ready Calendar proposal must provide a structured payload");
  const { title, startsAt, endsAt, category, commitment } = proposal.payloadJson;
  if (typeof title !== "string" || !title.trim()) throw new CaptureProposalPersistenceError("A ready Calendar proposal requires a title");
  if (typeof startsAt !== "string" || typeof endsAt !== "string") {
    throw new CaptureProposalPersistenceError("A ready Calendar proposal requires explicit start and end timestamps");
  }
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new CaptureProposalPersistenceError("A ready Calendar proposal requires a valid time range");
  }
  if (typeof category !== "string" || !calendarCategories.has(category)) {
    throw new CaptureProposalPersistenceError("A ready Calendar proposal requires a resolved Calendar category");
  }
  if (typeof commitment !== "string" || !calendarCommitments.has(commitment)) {
    throw new CaptureProposalPersistenceError("A ready Calendar proposal requires a resolved commitment level");
  }
}

function validateProposal(proposal: InterpretedRoutingProposal) {
  requireText(proposal.key, "interpreter proposal key");
  requireText(proposal.summary, "proposal summary");
  requireText(proposal.reason, "proposal reason");
  if (!proposalStates.has(proposal.state as string)) {
    throw new CaptureProposalPersistenceError(`Interpreter cannot create proposal state ${String(proposal.state)}`);
  }
  if (!approvalModes.has(proposal.approvalMode as string)) {
    throw new CaptureProposalPersistenceError(`Unknown proposal approval mode ${String(proposal.approvalMode)}`);
  }
  if (!trustClasses.has(proposal.targetTrustClass as string)) {
    throw new CaptureProposalPersistenceError(`Unknown proposal trust class ${String(proposal.targetTrustClass)}`);
  }
  if (!isRecord(proposal.payloadJson)) throw new CaptureProposalPersistenceError(`Proposal ${proposal.key} payload must be an object`);
  if ("rawText" in proposal.payloadJson || "sourceText" in proposal.payloadJson) {
    throw new CaptureProposalPersistenceError(`Proposal ${proposal.key} must reference Capture provenance instead of copying raw source text`);
  }
  const owners = operationOwners[proposal.operation as ProposedOperation];
  if (!owners || !owners.includes(proposal.destination as RoutingDestination)) {
    throw new CaptureProposalPersistenceError(`${String(proposal.operation)} cannot be routed to ${String(proposal.destination)}; domain ownership must remain explicit`);
  }
  if (proposal.approvalMode === "HIGH_AUTHORITY_APPROVAL" && proposal.state === "READY_TO_APPLY") {
    throw new CaptureProposalPersistenceError("High-authority proposals cannot enter the ordinary ready-to-apply path");
  }
  if (proposal.destination === "CALENDAR" && proposal.operation === "CREATE_CALENDAR_PLAN" && proposal.state === "READY_TO_APPLY") {
    validateReadyCalendarPayload(proposal);
  }
}

function validateInterpretation(value: CaptureInterpretationResult) {
  if (!interpreterKinds.has(value.interpreter as string)) throw new CaptureProposalPersistenceError(`Unknown interpreter kind ${String(value.interpreter)}`);
  if (!routingIntents.has(value.intent as string)) throw new CaptureProposalPersistenceError(`Unknown routing intent ${String(value.intent)}`);
  if (!certaintySignals.has(value.certainty as string)) throw new CaptureProposalPersistenceError(`Unknown certainty signal ${String(value.certainty)}`);
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    throw new CaptureProposalPersistenceError("Interpreter confidence must be between 0 and 1");
  }
  if (!Array.isArray(value.observations) || !Array.isArray(value.proposals)) {
    throw new CaptureProposalPersistenceError("Interpreter result must contain observations and proposals arrays");
  }
  for (const observation of value.observations) {
    if (!observation || observation.trustClass !== "OBSERVATION") {
      throw new CaptureProposalPersistenceError("Interpreter observations must remain OBSERVATION-class data");
    }
  }
  const keys = new Set<string>();
  for (const proposal of value.proposals) {
    validateProposal(proposal);
    if (keys.has(proposal.key)) throw new CaptureProposalPersistenceError(`Interpreter produced duplicate proposal key ${proposal.key}`);
    keys.add(proposal.key);
  }
}

function receiptFromBundle(capture: CaptureRecord, bundle: RoutingPersistenceBundle, idempotentReplay: boolean): CaptureAndProposeReceipt {
  return {
    captureId: capture.captureId,
    correlationId: capture.correlationId,
    interpretationId: bundle.interpretation.interpretationId,
    proposalIds: bundle.proposals.map((item) => item.proposalId),
    proposalStates: bundle.proposals.map((item) => item.state),
    idempotentReplay,
  };
}

function validateRequest(command: CaptureAndProposeCommand, context: WriteRequestContext) {
  requireText(command.rawText, "rawText");
  requireText(context.principal.userId, "requestContext.principal.userId");
  requireText(context.requestId, "requestContext.requestId");
  if (context.principal.actorType !== "USER") throw new CaptureProposalPersistenceError("Capture creation requires an authenticated user principal");
  if (!Number.isFinite(Date.parse(context.receivedAt))) throw new CaptureProposalPersistenceError("requestContext.receivedAt must be a valid timestamp");
}

export async function captureAndPropose(
  command: CaptureAndProposeCommand,
  context: WriteRequestContext,
  dependencies: CaptureAndProposeDependencies,
): Promise<CaptureAndProposeReceipt> {
  validateRequest(command, context);
  const authenticatedUserId = context.principal.userId;

  const candidateCaptureId = dependencies.ids.next("capture");
  const candidate: CaptureRecord = {
    captureId: candidateCaptureId,
    userId: authenticatedUserId,
    rawText: command.rawText,
    source: context.source,
    correlationId: candidateCaptureId,
    requestId: context.requestId,
    receivedAt: context.receivedAt,
    recordedAt: dependencies.clock.now(),
  };

  const capture = await dependencies.unitOfWork.run(
    authenticatedUserId,
    (transaction) => transaction.getOrCreateCaptureRecord(candidate),
  );
  if (capture.rawText !== command.rawText || capture.source !== context.source) {
    throw new CaptureProposalPersistenceError("This request ID is already bound to different Capture content");
  }

  const existing = await dependencies.unitOfWork.run(
    authenticatedUserId,
    (transaction) => transaction.getRoutingBundleForCapture(capture.captureId, capture.userId),
  );
  if (existing) return receiptFromBundle(capture, existing, true);

  // Interpretation happens after the raw Capture commit and outside a DB transaction.
  const interpreted = await dependencies.interpreter.interpret({ rawText: capture.rawText, receivedAt: capture.receivedAt });
  validateInterpretation(interpreted);

  const interpretationId = dependencies.ids.next("interpretation");
  const createdAt = dependencies.clock.now();
  const interpretation = {
    interpretationId,
    captureId: capture.captureId,
    userId: capture.userId,
    version: 1 as const,
    interpreter: interpreted.interpreter,
    intent: interpreted.intent,
    certainty: interpreted.certainty,
    confidence: interpreted.confidence,
    observations: interpreted.observations.map((item) => ({ ...item })),
    clarification: interpreted.clarification,
    createdAt,
  };

  const proposals: RoutingProposalRecord[] = interpreted.proposals.map((proposal) => ({
    proposalId: dependencies.ids.next("proposal"),
    interpreterProposalKey: proposal.key,
    userId: capture.userId,
    captureId: capture.captureId,
    interpretationId,
    destination: proposal.destination,
    operation: proposal.operation,
    summary: proposal.summary.trim(),
    targetTrustClass: proposal.targetTrustClass,
    approvalMode: proposal.approvalMode,
    state: proposal.state,
    reason: proposal.reason.trim(),
    payloadJson: structuredClone(proposal.payloadJson),
    createdAt,
  }));

  return dependencies.unitOfWork.run(authenticatedUserId, async (transaction) => {
    // Serialize all proposal-bundle creation for this Capture. A concurrent request that
    // interpreted the same Capture waits here, then sees the winner's committed bundle.
    const locked = await transaction.lockCaptureForRouting(capture.captureId, capture.userId);
    if (!locked) throw new CaptureProposalPersistenceError("Capture became unavailable before proposal persistence");

    const raced = await transaction.getRoutingBundleForCapture(capture.captureId, capture.userId);
    if (raced) return receiptFromBundle(capture, raced, true);

    await transaction.createRoutingInterpretation(interpretation);
    for (const proposal of proposals) await transaction.createRoutingProposal(proposal);
    return receiptFromBundle(capture, { interpretation, proposals }, false);
  });
}
