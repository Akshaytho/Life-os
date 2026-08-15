import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalCalendarReader, CanonicalCalendarRecord } from "../../../packages/domain/canonical-calendar-read";
import { CanonicalCalendarReadError, getCanonicalCalendar } from "./get-canonical-calendar";

class FixtureReader implements CanonicalCalendarReader {
  calls: Array<{ userId: string; from: string; to: string }> = [];
  records: CanonicalCalendarRecord[] = [];

  async listOverlapping(authenticatedUserId: string, fromInclusive: string, toExclusive: string) {
    this.calls.push({ userId: authenticatedUserId, from: fromInclusive, to: toExclusive });
    return structuredClone(this.records);
  }
}

function principal(userId = "owner-user") {
  return { actorType: "USER" as const, userId };
}

test("projects canonical Calendar facts without leaking owner or proposal provenance", async () => {
  const reader = new FixtureReader();
  reader.records = [{
    id: "calendar-1",
    userId: "owner-user",
    title: "Gym",
    startsAt: "2026-08-16T11:30:00.000Z",
    endsAt: "2026-08-16T12:30:00.000Z",
    category: "Health",
    commitment: "Important",
    createdAt: "2026-08-15T18:32:01.000Z",
    sourceProposalId: "proposal-private-1",
  }];

  const result = await getCanonicalCalendar(
    { from: "2026-08-16T00:00:00+05:30", to: "2026-08-17T00:00:00+05:30" },
    { principal: principal() },
    { reader },
  );

  assert.deepEqual(reader.calls, [{
    userId: "owner-user",
    from: "2026-08-15T18:30:00.000Z",
    to: "2026-08-16T18:30:00.000Z",
  }]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.authorityClass, "FACT");
  assert.equal(result.items[0]?.title, "Gym");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("owner-user"), false);
  assert.equal(serialized.includes("proposal-private-1"), false);
});

test("requires an authenticated USER principal before reading persistence", async () => {
  const reader = new FixtureReader();

  await assert.rejects(
    () => getCanonicalCalendar(
      { from: "2026-08-16T00:00:00Z", to: "2026-08-17T00:00:00Z" },
      { principal: { actorType: "LIFE_OS", userId: "owner-user" } },
      { reader },
    ),
    (error: unknown) => error instanceof CanonicalCalendarReadError,
  );
  assert.equal(reader.calls.length, 0);
});

test("rejects ambiguous, reversed and oversized Calendar windows before reading persistence", async () => {
  const reader = new FixtureReader();
  const cases = [
    { from: "2026-08-16", to: "2026-08-17T00:00:00Z" },
    { from: "2026-08-17T00:00:00Z", to: "2026-08-16T00:00:00Z" },
    { from: "2026-08-01T00:00:00Z", to: "2026-09-02T00:00:00Z" },
  ];

  for (const input of cases) {
    await assert.rejects(
      () => getCanonicalCalendar(input, { principal: principal() }, { reader }),
      (error: unknown) => error instanceof CanonicalCalendarReadError,
    );
  }
  assert.equal(reader.calls.length, 0);
});
