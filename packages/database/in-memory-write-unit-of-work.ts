import type {
  AppliedProposalRecord,
  CalendarPlanInput,
  CalendarPlanRecord,
  CaptureRecord,
  DomainEventRecord,
  ProposalRejectionRecord,
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
  | "CREATE_REJECTION"
  | "MARK_REJECTED"
  | "CREATE_CALENDAR"
  | "APPEND_EVENT"
  | "MARK_APPLIED"
  | "MARK_STORED_APPLIED";

interface MemoryState {
  captures: Map<string, CaptureRecord>;
  interpretations: Map<string, RoutingInterpretationRecord>;
  routingProposals: Map<string, RoutingProposalRecord>;
  proposalRejections: Map<string, ProposalRejectionRecord>;
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
    proposalRejections: new Map([...state.proposalRejections].map(([key, value]) => [key, { ...value }])),
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
    proposalRejections: new Map(),
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
      proposalRejections: [...this.state.proposalRejections.values()].map((item) => ({ ...item })),
      storedProposals: [...this.state.routingProposals.values()]
        .map((proposal) => calendarProjection(this.state, proposal))
        .filter((value): value is StoredCalendarProposal => Boolean(value)),
      calendarPlans: [...this.state.calendarPlans.values()],
      domainEvents: [...this.state.domainEvents.values()],
      appliedProposals: [...this.state.appliedProposals.values()],
    };
  }

  async run<T>(authenticatedUserId: string, work: (transaction: WriteTransaction) => Promise<T>): Promise<T> {
    if (!authenticatedUserId.trim()) throw new Error("authenticatedUserId is required for a private transaction");

    const staged = cloneState(this.state);
    let localFailurePoint = this.failurePoint;
    this.failurePoint = "NONE";

    const maybeFail = (point: Exclude<FailurePoint, "NONE">) => {
      if (localFailurePoint === point) {
        localFailurePoint = "NONE";
        throw new Error(`Injected transaction failure at ${point}`);
      }
    };
    const requireOwner = (userId: string, label: string) => {
      if (userId !== authenticatedUserId) throw new Error(`${label} is outside the authenticated user scope`);
    };

    const transaction: WriteTransaction = {
      getOrCreateCaptureRecord: async (record) => {
        requireOwner(record.userId, "Capture");
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
        requireOwner(userId, "Capture lock");
        const capture = staged.captures.get(captureId);
        return Boolean(capture && capture.userId === authenticatedUserId);
      },
      getRoutingBundleForCapture: async (captureId, userId) => {
        requireOwner(userId, "Routing bundle");
        return routingBundle(staged, captureId, authenticatedUserId);
      },
      createRoutingInterpretation: async (record) => {
        requireOwner(record.userId, "Routing interpretation");
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
        requireOwner(record.userId, "Routing proposal");
        maybeFail("CREATE_ROUTING_PROPOSAL");
        if (staged.routingProposals.has(record.proposalId)) throw new Error(`Proposal ${record.proposalId} already exists`);
        const capture = staged.captures.get(record.captureId);
        if (!capture || capture.userId !== authenticatedUserId) throw new Error(`Capture ${record.captureId} is unavailable`);
        if (record.interpretationId) {
          const interpretation = staged.interpretations.get(record.interpretationId);
          if (!interpretation || interpretation.captureId !== record.captureId || interpretation.userId !== authenticatedUserId) {
            throw new Error(`Interpretation ${record.interpretationId} is unavailable`);
          }
        }
        staged.routingProposals.set(record.proposalId, cloneRoutingProposal(record));
      },
      getRoutingProposalForUpdate: async (proposalId, userId) => {
        requireOwner(userId, "Routing proposal read");
        const proposal = staged.routingProposals.get(proposalId);
        if (!proposal || proposal.userId !== authenticatedUserId) return undefined;
        return cloneRoutingProposal(proposal);
      },
      findProposalRejection: async (proposalId) => {
        const proposal = staged.routingProposals.get(proposalId);
        if (!proposal || proposal.userId !== authenticatedUserId) return undefined;
        const rejection = staged.proposalRejections.get(proposalId);
        return rejection ? { ...rejection } : undefined;
      },
      createProposalRejection: async (record) => {
        requireOwner(record.userId, "Proposal rejection");
        if (record.rejectedByActorId !== authenticatedUserId) {
          throw new Error("Proposal rejection actor must match authenticated user scope");
        }
        const proposal = staged.routingProposals.get(record.proposalId);
        if (!proposal || proposal.userId !== authenticatedUserId) throw new Error(`Proposal ${record.proposalId} is unavailable`);
        maybeFail("CREATE_REJECTION");
        if (staged.proposalRejections.has(record.proposalId)) throw new Error(`Proposal ${record.proposalId} was already rejected`);
        staged.proposalRejections.set(record.proposalId, { ...record });
      },
      markRoutingProposalRejected: async (proposalId, userId) => {
        requireOwner(userId, "Routing proposal rejection");
        maybeFail("MARK_REJECTED");
        const proposal = staged.routingProposals.get(proposalId);
        if (!proposal || proposal.userId !== authenticatedUserId) throw new Error(`Proposal ${proposalId} is unavailable`);
        if (!(["PROPOSED", "NEEDS_CONFIRMATION", "READY_TO_APPLY"] as const).includes(proposal.state as "PROPOSED" | "NEEDS_CONFIRMATION" | "READY_TO_APPLY")) {
          throw new Error(`Stored proposal ${proposalId} was not rejectable`);
        }
        staged.routingProposals.set(proposalId, { ...proposal, state: "REJECTED" });
      },
      getStoredCalendarProposalForUpdate: async (proposalId, userId) => {
        requireOwner(userId, "Stored proposal read");
        const proposal = staged.routingProposals.get(proposalId);
        if (!proposal || proposal.userId !== authenticatedUserId) return undefined;
        return calendarProjection(staged, proposal);
      },
      findAppliedProposal: async (proposalId) => {
        const proposal = staged.routingProposals.get(proposalId);
        if (!proposal || proposal.userId !== authenticatedUserId) return undefined;
        return staged.appliedProposals.get(proposalId);
      },
      createCalendarPlan: async (record) => {
        requireOwner(record.userId, "Calendar plan");
        maybeFail("CREATE_CALENDAR");
        if (staged.calendarPlans.has(record.id)) throw new Error(`Calendar plan ${record.id} already exists`);
        staged.calendarPlans.set(record.id, record);
      },
      appendDomainEvent: async (event) => {
        requireOwner(event.userId, "Domain event");
        if (event.actorType === "USER" && event.actorId !== authenticatedUserId) {
          throw new Error("USER domain-event actor must match authenticated user scope");
        }
        maybeFail("APPEND_EVENT");
        if (staged.domainEvents.has(event.eventId)) throw new Error(`Domain event ${event.eventId} already exists`);
        staged.domainEvents.set(event.eventId, event);
      },
      markProposalApplied: async (record) => {
        if (record.confirmedByActorId !== authenticatedUserId) {
          throw new Error("Applied proposal actor must match authenticated user scope");
        }
        const proposal = staged.routingProposals.get(record.proposalId);
        if (!proposal || proposal.userId !== authenticatedUserId) throw new Error(`Proposal ${record.proposalId} is unavailable`);
        maybeFail("MARK_APPLIED");
        if (staged.appliedProposals.has(record.proposalId)) throw new Error(`Proposal ${record.proposalId} was already applied`);
        staged.appliedProposals.set(record.proposalId, record);
      },
      markStoredProposalApplied: async (proposalId, userId, appliedAt, entityId, eventId) => {
        requireOwner(userId, "Stored proposal update");
        maybeFail("MARK_STORED_APPLIED");
        const proposal = staged.routingProposals.get(proposalId);
        if (!proposal || proposal.userId !== authenticatedUserId) throw new Error(`Stored proposal ${proposalId} not found`);
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
