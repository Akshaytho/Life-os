import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalCalendarReader, CanonicalCalendarRecord } from "../../../packages/domain/canonical-calendar-read";
import { getCanonicalCalendar } from "./get-canonical-calendar";

const userId = "calendar-order-owner";
const input = { from: "2026-08-17T00:00:00.000Z", to: "2026-08-18T00:00:00.000Z" };
const context = { principal: { actorType: "USER" as const, userId } };

function item(id: string, startsAt: string, endsAt: string): CanonicalCalendarRecord {
  return {
    id,
    userId,
    title: id,
    startsAt,
    endsAt,
    category: "Personal",
    commitment: "Flexible",
    createdAt: "2026-08-16T20:00:00.000Z",
    sourceProposalId: `proposal-${id}`,
  };
}

const canonical = [
  item("a", "2026-08-17T01:00:00.000Z", "2026-08-17T02:00:00.000Z"),
  item("b", "2026-08-17T03:00:00.000Z", "2026-08-17T04:30:00.000Z"),
  item("c", "2026-08-17T03:00:00.000Z", "2026-08-17T04:00:00.000Z"),
  item("d", "2026-08-17T03:00:00.000Z", "2026-08-17T04:00:00.000Z"),
  item("e", "2026-08-17T08:00:00.000Z", "2026-08-17T09:00:00.000Z"),
  item("f", "2026-08-17T12:00:00.000Z", "2026-08-17T13:00:00.000Z"),
  item("g", "2026-08-17T18:00:00.000Z", "2026-08-17T20:00:00.000Z"),
  item("h", "2026-08-17T23:00:00.000Z", "2026-08-18T00:30:00.000Z"),
];

const expectedIds = ["a", "c", "d", "b", "e", "f", "g", "h"];

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function reader(records: CanonicalCalendarRecord[]): CanonicalCalendarReader {
  return { async listOverlapping() { return structuredClone(records); } };
}

test("canonical Calendar is deterministic across 120 reader-order permutations", async (t) => {
  for (let seed = 1; seed <= 120; seed += 1) {
    await t.test(`reader permutation ${seed}`, async () => {
      const source = shuffled(canonical, seed);
      const sourceIdsBefore = source.map((record) => record.id);
      const result = await getCanonicalCalendar(input, context, { reader: reader(source) });
      assert.deepEqual(result.items.map((record) => record.id), expectedIds);
      assert.deepEqual(source.map((record) => record.id), sourceIdsBefore, "canonical read must not mutate reader-owned arrays");
    });
  }
});

test("canonical ordering tie-breaks by start, then end, then stable identity", async () => {
  const sameStart = [
    item("z", "2026-08-17T10:00:00.000Z", "2026-08-17T11:00:00.000Z"),
    item("a", "2026-08-17T10:00:00.000Z", "2026-08-17T11:00:00.000Z"),
    item("m", "2026-08-17T10:00:00.000Z", "2026-08-17T10:30:00.000Z"),
  ];
  const result = await getCanonicalCalendar(input, context, { reader: reader(sameStart) });
  assert.deepEqual(result.items.map((record) => record.id), ["m", "a", "z"]);
});
