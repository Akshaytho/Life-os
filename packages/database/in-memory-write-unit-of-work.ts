import type {
  AppliedProposalRecord,
  CalendarPlanInput,
  CalendarPlanRecord,
  CaptureRecord,
  DomainEventRecord,
  RoutingInterpretationRecord,
  RoutingPersistenceBundle,
  RoutingProposalRecord,
  StoredCalendarProposal,
  WriteTransaction,
  WriteUnitOfWork,
} from "../domain/write-boundary";

type FailurePoint =
  | "NONE"
  | "CREATE_CAPTURE"
  | "CREATE_INTERPRETATION"
  | "CREATE_ROUTING_PROPOSAL"
  | "CREATE_CALENDAR"
  | "APPEND_EVENT"
  | "MARK_APPLIED"
  | "MARK_STORED_APPLIED";

interface MemoryState {
  captures: Map<string, CaptureRecord>;
  interpretations: Map<string, RoutingInterpretationRecord>;
  routingProposals: Map<string, RoutingProposalRecord>;
  calendarPlans: Map<string, CalendarPlanRecord>;
  domainEvents: Map<string, DomainEventRecord>;
  appliedProposals: Map<string, AppliedProposalRecord>;
}

function cloneInterpretation(value: RoutingInterpretationRecord): RoutingInterpretationRecord {
  return { ...value, observations: value.observations.map((item) => ({ ...item })) };
}

function cloneRoutingProposal(value: RoutingProposalRecord): RoutingProposalRecord {
  return { ...value, payloadJson: structuredClone(value.payloadJson) };
}

function cloneState(state: MemoryState): MemoryState {
  return {
    captures: new Map([...state.captures].map(([key, value]) => [key, { ...value }])),
    interpretations: new Map([...state.interpretations].map(([key, value]) => [key, cloneInterpretation(value)])),
    routingProposals: new Map([...state.routingProposals].map(([key, value]) => [key, cloneRoutingProposal(value)])),
    calendarPlans: new Map(state.calendarPlans),
    domainEvents: new Map(state.domainEvents),
    appliedProposals: new Map(state.appliedProposals),
  };
}

function calendarProjection(state: MemoryState, proposal: RoutingProposalRecord): StoredCalendarProposal | undefined {
  if (proposal.destination !== "CALENDAR" || proposal.operation !== "CREATE_CALENDAR_PLAN") return undefined;
  const capture = state.captures.get(proposal.captureId);
  if (!capture || capture.userId !== proposal.userId) return undefined;
  const plan = proposal.payloadJson as unknown as CalendarPlanInput;

  return {
    proposalId: proposal.proposalId,
    userId: proposal.userId,
    captureId: proposal.captureId,
    sourceText: capture.rawText,
    correlationId: capture.correlationId,
    destination: "CALENDAR",
    operation: "CREATE_CALENDAR_PLAN",
    approvalMode: proposal.approvalMode,
    state: proposal.state,
    plan: structuredClone(plan),
    createdAt: proposal.createdAt,
    appliedAt: proposal.appliedAt,
    appliedEntityId: proposal.appliedEntityId,
    appliedEventId: proposal.appliedEventId,
  };
}

function routingBundle(state: MemoryState, captureId: string, userId: string): RoutingPersistenceBundle | undefined {
  const interpretation = [...state.interpretations.values()].find(
    (item) => item.captureId === captureId && item.userId === userId && item.version === 1,
  );
  if (!interpretation) return undefined;

  return {
    interpretation: cloneInterpretation(interpretation),
    proposals: [...state.routingProposals.values()]
      .filter((item) => item.interpretationId === interpretation.interpretationId && item.userId === userId)
      .map(cloneRoutingProposal),
  };
}

export class InMemoryWriteUnitOfWork implements WriteUnitOfWork {
  private state: MemoryState = {
    captures: new Map(),
    interpretations: new Map(),
    routingProposals: new Map(),
    calendarPlans: new Map(),
    domainEvents: new Map(),
    appliedProposals: new Map(),
  };

  private failurePoint: FailurePoint = "NONE";

  seedStoredCalendarProposal(proposal: StoredCalendarProposal) {
    const capture: CaptureRecord = {
      captureId: proposal.captureId,
      userId: proposal.userId,
      rawText: proposal.sourceText,
      source: "WEB_APP",
      correlationId: proposal.correlationId,
      requestId: `seed:${proposal.proposalId}`,
      receivedAt: proposal.createdAt,
      recordedAt: proposal.createdAt,
    };
    this.state.captures.set(capture.captureId, capture);
    this.state.routingProposals.set(proposal.proposalId, {
      proposalId: proposal.proposalId,
      interpreterProposalKey: `seed:${proposal.proposalId}`,
      userId: proposal.userId,
      captureId: proposal.captureId,
      destination: proposal.destination,
      operation: proposal.operation,
      summary: "Seeded Calendar proposal",
      targetTrustClass: "FACT",
      approvalMode: proposal.approvalMode,
      state: proposal.state,
      reason: "Deterministic test seed",
      payloadJson: structuredClone(proposal.plan) as unknown as Record<string, unknown>,
      createdAt: proposal.createdAt,
      appliedAt: proposal.appliedAt,
      appliedEntityId: proposal.appliedEntityId,
      appliedEventId: proposal.appliedEventId,
    });
  }

  failNextAt(point: Exclude<FailurePoint, "NONE">) {
    this.failurePoint = point;
  }

  snapshot() {
    return {
      captures: [...this.state.captures.values()].map((item) => ({ ...item })),
      interpretations: [...this.state.interpretations.values()].map(cloneInterpretation),
      routingProposals: [...this.state.routingProposals.values()].map(cloneRoutingProposal),
      storedProposals: [...this.state.routingProposals.values()]
        .map((proposal) => calendarProjection(this.state, proposal))
        .filter((value): value is StoredCalendarProposal => Boolean(value)),
      calendarPlans: [...this.state.calendarPlans.values()],
      domainEvents: [...this.state.domainEvents.values()],
      appliedProposals: [...this.state.appliedProposals.values()],
    };
  }

  async run<T>(work: (transaction: WriteTransaction) => Promise<T>): Promise<T> {
    const staged = cloneState(this.state);
    let localFailurePoint = this.failurePoint;
    this.failurePoint = "NONE";

    const maybeFail = (point: Exclude<FailurePoint, "NONE">) => {
      if (localFailurePoint === point) {
        localFailurePoint = "NONE";
        throw new Error(`Injected transaction failure at ${point}`);
      }
    };

    const transaction: WriteTransaction = {
      getOrCreateCaptureRecord: async (record) => {
        const existing = [...staged.captures.values()].find(
          (item) => item.userId === record.userId && item.requestId === record.requestId,
        );
        if (existing) return { ...existing };

        maybeFail("CREATE_CAPTURE");
        if (staged.captures.has(record.captureId)) throw new Error(`Capture ${record.captureId} already exists`);
        staged.captures.set(record.captureId, { ...record });
        return { ...record };
      },
      lockCaptureForRouting: async (captureId, userId) => {
        const capture = staged.captures.get(captureId);
        return Boolean(capture && capture.userId === userId);
      },
      getRoutingBundleForCapture: async (captureId, userId) => routingBundle(staged, captureId, userId),
      createRoutingInterpretation: async (record) => {
        maybeFail("CREATE_INTERPRETATION");
        if (staged.interpretations.has(record.interpretationId)) {
          throw new Error(`Interpretation ${record.interpretationId} already exists`);
        }
        const duplicate = [...staged.interpretations.values()].find(
          (item) => item.captureId === record.captureId && item.userId === record.userId && item.version === record.version,
        );
        if (duplicate) throw new Error(`Capture ${record.captureId} already has interpretation version ${record.version}`);
        staged.interpretations.set(record.interpretationId, cloneInterpretation(record));
      },
      createRoutingProposal: async (record) => {
        maybeFail("CREATE_ROUTING_PROPOSAL");
        if (staged.routingProposals.has(record.proposalId)) throw new Error(`Proposal ${record.proposalId} already exists`);
        const capture = staged.captures.get(record.captureId);
        if (!capture || capture.userId !== record.userId) throw new Error(`Capture ${record.captureId} is unavailable`);
        if (record.interpretationId) {
          const interpretation = staged.interpretations.get(record.interpretationId);
          if (!interpretation || interpretation.captureId !== record.captureId || interpretation.userId !== record.userId) {
            throw new Error(`Interpretation ${record.interpretationId} is unavailable`);
          }
        }
        staged.routingProposals.set(record.proposalId, cloneRoutingProposal(record));
      },
      getStoredCalendarProposalForUpdate: async (proposalId, userId) => {
        const proposal = staged.routingProposals.get(proposalId);
        if (!proposal || proposal.userId !== userId) return undefined;
        return calendarProjection(staged, proposal);
      },
      findAppliedProposal: async (proposalId) => staged.appliedProposals.get(proposalId),
      createCalendarPlan: async (record) => {
        maybeFail("CREATE_CALENDAR");
        if (staged.calendarPlans.has(record.id)) throw new Error(`Calendar plan ${record.id} already exists`);
        staged.calendarPlans.set(record.id, record);
      },
      appendDomainEvent: async (event) => {
        maybeFail("APPEND_EVENT");
        if (staged.domainEvents.has(event.eventId)) throw new Error(`Domain event ${event.eventId} already exists`);
        staged.domainEvents.set(event.eventId, event);
      },
      markProposalApplied: async (record) => {
        maybeFail("MARK_APPLIED");
        if (staged.appliedProposals.has(record.proposalId)) throw new Error(`Proposal ${record.proposalId} was already applied`);
        staged.appliedProposals.set(record.proposalId, record);
      },
      markStoredProposalApplied: async (proposalId, userId, appliedAt, entityId, eventId) => {
        maybeFail("MARK_STORED_APPLIED");
        const proposal = staged.routingProposals.get(proposalId);
        if (!proposal || proposal.userId !== userId) throw new Error(`Stored proposal ${proposalId} not found`);
        if (proposal.state === "APPLIED") throw new Error(`Stored proposal ${proposalId} was already applied`);
        staged.routingProposals.set(proposalId, {
          ...proposal,
          state: "APPLIED",
          appliedAt,
          appliedEntityId: entityId,
          appliedEventId: eventId,
        });
      },
    };

    const result = await work(transaction);
    this.state = staged;
    if (localFailurePoint !== "NONE" && this.failurePoint === "NONE") {
      this.failurePoint = localFailurePoint;
    }
    return result;
  }
}
