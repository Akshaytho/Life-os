import assert from "node:assert/strict";
import test from "node:test";
import type {
  JourneyDecisionReader,
  JourneyDecisionReadRecord,
} from "../../../packages/domain/journey-read";
import {
  getJourneyOverview,
  JourneyOverviewReadError,
} from "./get-journey-overview";

class Reader implements JourneyDecisionReader {
  calls: Array<{ userId: string; limit: number }> = [];
  constructor(readonly rows: JourneyDecisionReadRecord[]) {}
  async listForUser(authenticatedUserId: string, limit: number) {
    this.calls.push({ userId: authenticatedUserId, limit });
    return structuredClone(this.rows);
  }
}

const principal = { actorType: "USER" as const, userId: "user-a" };

function row(overrides: Partial<JourneyDecisionReadRecord> = {}): JourneyDecisionReadRecord {
  return {
    journeyId: "journey-1",
    userId: "user-a",
    name: "Travel Creator",
    activeCapability: "Sound Design",
    status: "ACTIVE",
    decidedAt: "2026-08-17T12:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}

test("empty Journey state is canonical and does not invent a default Journey", async () => {
  const reader = new Reader([]);
  const overview = await getJourneyOverview({ principal }, { reader });
  assert.deepEqual(overview, { current: null, history: [] });
  assert.deepEqual(reader.calls, [{ userId: "user-a", limit: 102 }]);
});

test("returns one active Journey decision and preserved history", async () => {
  const reader = new Reader([
    row(),
    row({
      journeyId: "journey-old",
      name: "Creator Craft",
      activeCapability: "Framing",
      status: "SUPERSEDED",
      decidedAt: "2026-08-16T10:00:00.000Z",
      endedAt: "2026-08-17T12:00:01.000Z",
    }),
  ]);
  const overview = await getJourneyOverview({ principal }, { reader });
  assert.equal(overview.current?.id, "journey-1");
  assert.equal(overview.current?.authorityClass, "DECISION");
  assert.equal(overview.current?.name, "Travel Creator");
  assert.equal(overview.current?.activeCapability, "Sound Design");
  assert.equal(overview.history.length, 1);
  assert.equal(overview.history[0]?.id, "journey-old");
  assert.equal(overview.history[0]?.authorityClass, "DECISION");
});

test("fails closed if a Journey adapter returns another user's row", async () => {
  const reader = new Reader([row({ userId: "user-b" })]);
  await assert.rejects(
    () => getJourneyOverview({ principal }, { reader }),
    (error: unknown) => error instanceof JourneyOverviewReadError && error.code === "JOURNEY_STATE_INVALID",
  );
});

test("fails closed if an adapter exposes more than one active Journey", async () => {
  const reader = new Reader([row(), row({ journeyId: "journey-2" })]);
  await assert.rejects(
    () => getJourneyOverview({ principal }, { reader }),
    (error: unknown) => error instanceof JourneyOverviewReadError && error.code === "JOURNEY_STATE_INVALID",
  );
});

test("fails closed on malformed Journey temporal state", async () => {
  for (const invalid of [
    row({ decidedAt: "not-a-date" }),
    row({ endedAt: "2026-08-17T13:00:00.000Z" }),
    row({ status: "SUPERSEDED", endedAt: null }),
    row({ status: "REVOKED", endedAt: "not-a-date" }),
  ]) {
    await assert.rejects(
      () => getJourneyOverview({ principal }, { reader: new Reader([invalid]) }),
      (error: unknown) => error instanceof JourneyOverviewReadError && error.code === "JOURNEY_STATE_INVALID",
    );
  }
});

test("fails closed when Journey history exceeds the reviewed bound", async () => {
  const rows: JourneyDecisionReadRecord[] = Array.from({ length: 101 }, (_, index) => row({
    journeyId: `journey-history-${index}`,
    status: "SUPERSEDED",
    decidedAt: `2026-08-${String((index % 16) + 1).padStart(2, "0")}T10:00:00.000Z`,
    endedAt: "2026-08-17T12:00:01.000Z",
  }));
  await assert.rejects(
    () => getJourneyOverview({ principal }, { reader: new Reader(rows) }),
    (error: unknown) => error instanceof JourneyOverviewReadError && error.code === "HISTORY_LIMIT_EXCEEDED",
  );
});
