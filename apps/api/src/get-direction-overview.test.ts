import assert from "node:assert/strict";
import test from "node:test";
import type {
  DirectionDecisionReader,
  DirectionDecisionReadRecord,
} from "../../../packages/domain/direction-read";
import {
  DirectionOverviewReadError,
  getDirectionOverview,
} from "./get-direction-overview";

function context(userId = "user-a") {
  return { principal: { actorType: "USER" as const, userId } };
}

function record(
  directionId: string,
  status: DirectionDecisionReadRecord["status"],
  overrides: Partial<DirectionDecisionReadRecord> = {},
): DirectionDecisionReadRecord {
  return {
    directionId,
    userId: "user-a",
    statement: `Statement for ${directionId}`,
    status,
    decidedAt: "2026-08-16T08:00:00.000Z",
    endedAt: status === "ACTIVE" ? null : "2026-08-16T09:00:00.000Z",
    ...overrides,
  };
}

function readerReturning(rows: DirectionDecisionReadRecord[], seenLimits?: number[]): DirectionDecisionReader {
  return {
    async listForUser(_authenticatedUserId, limit) {
      seenLimits?.push(limit);
      return rows;
    },
  };
}

test("projects only current Direction and user-visible history while preserving stored wording", async () => {
  const seenLimits: number[] = [];
  const wording = "Make films with curiosity.\nKeep real-life responsibilities visible.";
  const active = {
    ...record("direction-current", "ACTIVE", { statement: wording }),
    requestId: "must-not-leak",
    requestFingerprint: "a".repeat(64),
    recordedAt: "2026-08-16T08:00:01.000Z",
  } as DirectionDecisionReadRecord;
  const old = record("direction-old", "SUPERSEDED", {
    statement: "Earlier direction wording",
    decidedAt: "2026-08-15T08:00:00.000Z",
    endedAt: "2026-08-16T08:00:01.000Z",
  });

  const overview = await getDirectionOverview(context(), {
    reader: readerReturning([active, old], seenLimits),
  });

  assert.deepEqual(seenLimits, [102]);
  assert.deepEqual(overview, {
    current: {
      id: "direction-current",
      statement: wording,
      status: "ACTIVE",
      authorityClass: "DECISION",
      decidedAt: "2026-08-16T08:00:00.000Z",
    },
    history: [
      {
        id: "direction-old",
        statement: "Earlier direction wording",
        status: "SUPERSEDED",
        authorityClass: "DECISION",
        decidedAt: "2026-08-15T08:00:00.000Z",
        endedAt: "2026-08-16T08:00:01.000Z",
      },
    ],
  });
  assert.equal(JSON.stringify(overview).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(overview).includes("requestFingerprint"), false);
  assert.equal(overview.current?.statement, wording);
});

test("supports a valid history-only state when there is no active Direction", async () => {
  const overview = await getDirectionOverview(context(), {
    reader: readerReturning([
      record("direction-revoked", "REVOKED", {
        endedAt: "2026-08-16T10:00:00.000Z",
      }),
    ]),
  });

  assert.equal(overview.current, null);
  assert.equal(overview.history.length, 1);
  assert.equal(overview.history[0]?.status, "REVOKED");
});

test("fails closed if a reader returns another user's Direction", async () => {
  await assert.rejects(
    () => getDirectionOverview(context("user-a"), {
      reader: readerReturning([
        record("direction-other", "ACTIVE", { userId: "user-b", statement: "Private other Direction" }),
      ]),
    }),
    (error: unknown) =>
      error instanceof DirectionOverviewReadError && error.code === "DIRECTION_STATE_INVALID",
  );
});

test("fails closed instead of choosing between multiple active Directions", async () => {
  await assert.rejects(
    () => getDirectionOverview(context(), {
      reader: readerReturning([
        record("direction-a", "ACTIVE"),
        record("direction-b", "ACTIVE"),
      ]),
    }),
    (error: unknown) =>
      error instanceof DirectionOverviewReadError && error.code === "DIRECTION_STATE_INVALID",
  );
});

test("rejects lifecycle shapes that contradict canonical Direction state", async () => {
  for (const invalid of [
    record("active-ended", "ACTIVE", { endedAt: "2026-08-16T09:00:00.000Z" }),
    record("superseded-open", "SUPERSEDED", { endedAt: null }),
    record("revoked-invalid-time", "REVOKED", { endedAt: "not-a-time" }),
  ]) {
    await assert.rejects(
      () => getDirectionOverview(context(), { reader: readerReturning([invalid]) }),
      (error: unknown) =>
        error instanceof DirectionOverviewReadError && error.code === "DIRECTION_STATE_INVALID",
    );
  }
});

test("bounds V1 history rather than silently truncating canonical Direction decisions", async () => {
  const rows = Array.from({ length: 101 }, (_, index) =>
    record(`direction-history-${index}`, "SUPERSEDED", {
      decidedAt: new Date(Date.parse("2026-08-16T08:00:00.000Z") - index * 1000).toISOString(),
      endedAt: "2026-08-16T09:00:00.000Z",
    }),
  );

  await assert.rejects(
    () => getDirectionOverview(context(), { reader: readerReturning(rows) }),
    (error: unknown) =>
      error instanceof DirectionOverviewReadError && error.code === "HISTORY_LIMIT_EXCEEDED",
  );
});

test("rejects an empty authenticated principal before touching persistence", async () => {
  let called = false;
  const reader: DirectionDecisionReader = {
    async listForUser() {
      called = true;
      return [];
    },
  };

  await assert.rejects(
    () => getDirectionOverview(context("   "), { reader }),
    (error: unknown) =>
      error instanceof DirectionOverviewReadError && error.code === "INVALID_PRINCIPAL",
  );
  assert.equal(called, false);
});
