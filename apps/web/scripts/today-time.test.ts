import assert from "node:assert/strict";
import test from "node:test";
import { todayRange } from "../lib/today-time";

function withTimeZone<T>(timeZone: string, work: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return work();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test("Today uses local midnight boundaries before converting to UTC", () => {
  withTimeZone("Asia/Kolkata", () => {
    const range = todayRange(new Date("2026-08-17T14:45:00+05:30"));
    assert.deepEqual(range, {
      from: "2026-08-16T18:30:00.000Z",
      to: "2026-08-17T18:30:00.000Z",
    });
  });
});

test("spring-forward Today remains one local calendar day instead of forcing 24 hours", () => {
  withTimeZone("America/New_York", () => {
    const range = todayRange(new Date("2026-03-08T12:00:00-04:00"));
    assert.deepEqual(range, {
      from: "2026-03-08T05:00:00.000Z",
      to: "2026-03-09T04:00:00.000Z",
    });
    assert.equal(Date.parse(range.to) - Date.parse(range.from), 23 * 60 * 60 * 1000);
  });
});

test("fall-back Today remains one local calendar day even when it lasts 25 hours", () => {
  withTimeZone("America/New_York", () => {
    const range = todayRange(new Date("2026-11-01T12:00:00-05:00"));
    assert.deepEqual(range, {
      from: "2026-11-01T04:00:00.000Z",
      to: "2026-11-02T05:00:00.000Z",
    });
    assert.equal(Date.parse(range.to) - Date.parse(range.from), 25 * 60 * 60 * 1000);
  });
});
