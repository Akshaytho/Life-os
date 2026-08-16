import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalCalendarReader, CanonicalCalendarRecord } from "../../../packages/domain/canonical-calendar-read";
import { CanonicalCalendarReadError, getCanonicalCalendar } from "./get-canonical-calendar";

const userId = "calendar-owner";
const window = { from: "2026-08-17T00:00:00.000Z", to: "2026-08-18T00:00:00.000Z" };
const context = { principal: { actorType: "USER" as const, userId } };

function record(index = 0): CanonicalCalendarRecord {
  const hour = 1 + (index % 20);
  return {
    id: `calendar-${index}`,
    userId,
    title: `Calendar item ${index}`,
    startsAt: `2026-08-17T${String(hour).padStart(2, "0")}:00:00.000Z`,
    endsAt: `2026-08-17T${String(hour + 1).padStart(2, "0")}:00:00.000Z`,
    category: "Personal",
    commitment: "Flexible",
    createdAt: "2026-08-16T20:00:00.000Z",
    sourceProposalId: `proposal-${index}`,
  };
}

function readerFor(records: CanonicalCalendarRecord[]): CanonicalCalendarReader {
  return { async listOverlapping() { return structuredClone(records); } };
}

async function expectRejected(records: CanonicalCalendarRecord[]) {
  await assert.rejects(
    () => getCanonicalCalendar(window, context, { reader: readerFor(records) }),
    (error: unknown) => error instanceof CanonicalCalendarReadError,
  );
}

const variants = Array.from({ length: 20 }, (_, index) => index);

test("canonical Calendar fails closed across 100+ corrupted reader records", async (t) => {
  let cases = 0;

  for (const index of variants) {
    await t.test(`foreign owner ${index}`, async () => {
      const item = record(index);
      item.userId = `foreign-${index}`;
      await expectRejected([item]);
      cases += 1;
    });
  }

  for (const index of variants) {
    await t.test(`event fully before requested window ${index}`, async () => {
      const item = record(index);
      item.startsAt = `2026-08-16T${String(index % 20).padStart(2, "0")}:00:00.000Z`;
      item.endsAt = `2026-08-16T${String((index % 20) + 1).padStart(2, "0")}:00:00.000Z`;
      await expectRejected([item]);
      cases += 1;
    });
  }

  for (const index of variants) {
    await t.test(`event fully after requested window ${index}`, async () => {
      const item = record(index);
      item.startsAt = `2026-08-18T${String(index % 20).padStart(2, "0")}:00:00.000Z`;
      item.endsAt = `2026-08-18T${String((index % 20) + 1).padStart(2, "0")}:00:00.000Z`;
      await expectRejected([item]);
      cases += 1;
    });
  }

  for (const index of variants) {
    await t.test(`non-positive event interval ${index}`, async () => {
      const item = record(index);
      item.endsAt = index % 2 === 0 ? item.startsAt : "2026-08-17T00:00:00.000Z";
      await expectRejected([item]);
      cases += 1;
    });
  }

  for (const index of variants) {
    await t.test(`unsupported category ${index}`, async () => {
      const item = record(index);
      item.category = `Unknown-${index}` as never;
      await expectRejected([item]);
      cases += 1;
    });
  }

  for (const index of variants) {
    await t.test(`unsupported commitment ${index}`, async () => {
      const item = record(index);
      item.commitment = `Unknown-${index}` as never;
      await expectRejected([item]);
      cases += 1;
    });
  }

  assert.equal(cases, 120);
});

test("canonical Calendar rejects malformed persisted timestamps and duplicate identities", async (t) => {
  const malformed = [
    "",
    "not-a-date",
    "2026-08-17",
    "2026-08-17T10:00:00",
    "2026-13-17T10:00:00Z",
    "2026-08-32T10:00:00Z",
    "2026/08/17 10:00:00Z",
    "2026-08-17 10:00:00Z",
    "10:00:00Z",
    "2026-08-17T10:00Z trailing",
  ];

  for (const [index, timestamp] of malformed.entries()) {
    await t.test(`malformed startsAt ${index}`, async () => {
      const item = record(index);
      item.startsAt = timestamp;
      await expectRejected([item]);
    });
  }

  await t.test("duplicate canonical id in one window", async () => {
    const first = record(1);
    const second = record(2);
    second.id = first.id;
    await expectRejected([first, second]);
  });
});

test("valid overlapping records at both window edges remain canonical FACTs", async () => {
  const left = record(1);
  left.startsAt = "2026-08-16T23:30:00.000Z";
  left.endsAt = "2026-08-17T00:30:00.000Z";
  const right = record(2);
  right.startsAt = "2026-08-17T23:30:00.000Z";
  right.endsAt = "2026-08-18T00:30:00.000Z";

  const result = await getCanonicalCalendar(window, context, { reader: readerFor([left, right]) });
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((item) => item.authorityClass), ["FACT", "FACT"]);
  assert.equal(JSON.stringify(result).includes(userId), false, "owner identity stays out of browser projection");
  assert.equal(JSON.stringify(result).includes("sourceProposalId"), false, "proposal provenance stays private to storage");
});
