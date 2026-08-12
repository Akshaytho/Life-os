import type {
  AppliedProposalRecord,
  CalendarPlanRecord,
  DomainEventRecord,
  StoredCalendarProposal,
  WriteTransaction,
  WriteUnitOfWork,
} from "../domain/write-boundary";

type FailurePoint = "NONE" | "CREATE_CALENDAR" | "APPEND_EVENT" | "MARK_APPLIED" | "MARK_STORED_APPLIED";

interface MemoryState {
  calendarPlans: Map<string, CalendarPlanRecord>;
  domainEvents: Map<string, DomainEventRecord>;
  appliedProposals: Map<string, AppliedProposalRecord>;
  storedProposals: Map<string, StoredCalendarProposal>;
}

function cloneProposal(value: StoredCalendarProposal): StoredCalendarProposal {
  return { ...value, plan: { ...value.plan } };
}

function cloneState(state: MemoryState): MemoryState {
  return {
    calendarPlans: new Map(state.calendarPlans),
    domainEvents: new Map(state.domainEvents),
    appliedProposals: new Map(state.appliedProposals),
    storedProposals: new Map([...state.storedProposals].map(([key, value]) => [key, cloneProposal(value)])),
  };
}

export class InMemoryWriteUnitOfWork implements WriteUnitOfWork {
  private state: MemoryState = {
    calendarPlans: new Map(),
    domainEvents: new Map(),
    appliedProposals: new Map(),
    storedProposals: new Map(),
  };

  private failurePoint: FailurePoint = "NONE";

  seedStoredCalendarProposal(proposal: StoredCalendarProposal) {
    this.state.storedProposals.set(proposal.proposalId, cloneProposal(proposal));
  }

  failNextAt(point: Exclude<FailurePoint, "NONE">) {
    this.failurePoint = point;
  }

  snapshot() {
    return {
      calendarPlans: [...this.state.calendarPlans.values()],
      domainEvents: [...this.state.domainEvents.values()],
      appliedProposals: [...this.state.appliedProposals.values()],
      storedProposals: [...this.state.storedProposals.values()].map(cloneProposal),
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
      getStoredCalendarProposalForUpdate: async (proposalId, userId) => {
        const proposal = staged.storedProposals.get(proposalId);
        if (!proposal || proposal.userId !== userId) return undefined;
        return cloneProposal(proposal);
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
        const proposal = staged.storedProposals.get(proposalId);
        if (!proposal || proposal.userId !== userId) throw new Error(`Stored proposal ${proposalId} not found`);
        if (proposal.state === "APPLIED") throw new Error(`Stored proposal ${proposalId} was already applied`);
        staged.storedProposals.set(proposalId, {
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
    return result;
  }
}
