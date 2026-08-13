import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { TechnicalTelemetryEvent } from "../../../packages/contracts/technical-telemetry";
import { InMemoryWriteUnitOfWork } from "../../../packages/database/in-memory-write-unit-of-work";
import type { IdGenerator, StoredCalendarProposal } from "../../../packages/domain/write-boundary";
import type { SessionVerifier } from "../../../packages/domain/trusted-transport-auth";
import {
  createLifeOsPrivateProposalActionsServer,
  type PrivateProposalActionsApiDependencies,
} from "./private-proposal-actions-api";

export class ProposalActionVerifier implements SessionVerifier {
  calls: string[] = [];
  fail = false;
  async verify(value: string) {
    this.calls.push(value);
    if (this.fail) throw new Error("upstream unavailable");
    if (value === "owner-session") return { userId: "owner-user" };
    if (value === "other-session") return { userId: "other-user" };
    return undefined;
  }
}

class ApplyIds implements IdGenerator {
  private calendar = 0;
  private event = 0;
  next(prefix: "calendar" | "event") {
    if (prefix === "calendar") return `calendar-http-${++this.calendar}`;
    return `event-http-${++this.event}`;
  }
}

export function proposalFixture(overrides: Partial<StoredCalendarProposal> = {}): StoredCalendarProposal {
  return {
    proposalId: "proposal-1",
    userId: "owner-user",
    captureId: "capture-1",
    sourceText: "Synthetic source",
    correlationId: "capture-1",
    destination: "CALENDAR",
    operation: "CREATE_CALENDAR_PLAN",
    approvalMode: "REVIEW_AND_APPLY",
    state: "READY_TO_APPLY",
    plan: {
      title: "Gym",
      startsAt: "2026-08-15T13:00:00.000Z",
      endsAt: "2026-08-15T14:00:00.000Z",
      category: "Health",
      commitment: "Important",
    },
    createdAt: "2026-08-14T01:00:00.000Z",
    ...overrides,
  };
}

export function proposalActionFixture() {
  const verifier = new ProposalActionVerifier();
  const unitOfWork = new InMemoryWriteUnitOfWork();
  const telemetry: TechnicalTelemetryEvent[] = [];
  let request = 0;
  let operationMs = 100;
  const deps: PrivateProposalActionsApiDependencies = {
    sessionVerifier: verifier,
    transportClock: { now: () => "2026-08-14T01:30:00.000Z" },
    requestIds: { next: () => `server-request-${++request}` },
    unitOfWork,
    mutationClock: { now: () => "2026-08-14T01:30:01.000Z" },
    applyIds: new ApplyIds(),
    runtime: { environment: "ci", releaseSha: "proposal-actions-unit", platform: "CI" },
    telemetry: { emit(event) { telemetry.push(structuredClone(event)); } },
    operationTimer: {
      nowMs() { operationMs += 5; return operationMs; },
      nowIso() { return "2026-08-14T01:30:02.000Z"; },
    },
  };
  return { deps, verifier, unitOfWork, telemetry };
}

export async function withProposalActionServer(
  deps: PrivateProposalActionsApiDependencies,
  work: (baseUrl: string) => Promise<void>,
) {
  const server = createLifeOsPrivateProposalActionsServer(deps);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

export function proposalActionHeaders(session = "owner-session") {
  return { authorization: `Bearer ${session}`, "content-type": "application/json" };
}

export function applyRequest(session = "owner-session"): RequestInit {
  return {
    method: "POST",
    headers: proposalActionHeaders(session),
    body: JSON.stringify({ confirmation: { explicit: true } }),
  };
}

export function rejectRequest(reason?: string, session = "owner-session"): RequestInit {
  return {
    method: "POST",
    headers: proposalActionHeaders(session),
    body: JSON.stringify(reason === undefined ? {} : { reason }),
  };
}
