import type {
  AppliedProposalRecord,
  CalendarPlanRecord,
  DomainEventRecord,
  WriteTransaction,
  WriteUnitOfWork,
} from "../domain/write-boundary";

type FailurePoint = "NONE" | "CREATE_CALENDAR" | "APPEND_EVENT" | "MARK_APPLIED";

interface MemoryState {
  calendarPlans: Map<string, CalendarPlanRecord>;
  domainEvents: Map<string, DomainEventRecord>;
  appliedProposals: Map<string, AppliedProposalRecord>;
}

function cloneState(state: MemoryState): MemoryState {
  return {
    calendarPlans: new Map(state.calendarPlans),
    domainEvents: new Map(state.domainEvents),
    appliedProposals: new Map(state.appliedProposals),
  };
}

export class InMemoryWriteUnitOfWork implements WriteUnitOfWork {
  private state: MemoryState = {
    calendarPlans: new Map(),
    domainEvents: new Map(),
    appliedProposals: new Map(),
  };

  private failurePoint: FailurePoint = "NONE";

  failNextAt(point: Exclude<FailurePoint, "NONE">) {
    this.failurePoint = point;
  }

  snapshot() {
    return {
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
    };

    const result = await work(transaction);
    this.state = staged;
    return result;
  }
}
