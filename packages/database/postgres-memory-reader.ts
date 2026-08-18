import type { Pool, PoolClient } from "pg";
import type {
  GetMemoryOverviewCommand,
  MemoryCandidate,
  MemoryCompressedReview,
  MemoryItem,
  MemoryOverview,
  MemorySource,
  MemoryTrustedReference,
  MemoryVersion,
} from "../contracts/memory";
import type { MemoryReader } from "../domain/memory-read";
import { memoryItemFromRow } from "./postgres-memory-unit-of-work";
import { PostgresUserScope } from "./postgres-user-scope";

type MemoryRow = Parameters<typeof memoryItemFromRow>[0];

const memoryColumns = `memory_item_id, root_id, revision, user_id, kind, title, body,
  relationship, related_root_id, source_domain, source_entity_id,
  source_occurred_at, status, retained_at, recorded_at, ended_at,
  supersedes_memory_item_id, request_id, request_fingerprint`;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function cleanSummary(parts: Array<string | null>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ").slice(0, 1200);
}

async function sourceMap(client: PoolClient, userId: string, rows: ReturnType<typeof memoryItemFromRow>[]) {
  const values = new Map<string, MemorySource>();
  const periodicIds = rows.filter((row) => row.sourceDomain === "PERIODIC_REVIEW").map((row) => row.sourceEntityId);
  if (periodicIds.length) {
    const result = await client.query<{
      id: string; period_kind: "WEEK" | "MONTH"; period_start: string;
      period_end: string; submitted_at: Date;
    }>(
      `SELECT periodic_review_id AS id, period_kind, period_start::text,
              period_end::text, submitted_at
         FROM periodic_review WHERE user_id = $1 AND periodic_review_id = ANY($2::text[])`,
      [userId, periodicIds],
    );
    for (const row of result.rows) values.set(`PERIODIC_REVIEW:${row.id}`, {
      domain: "PERIODIC_REVIEW", entityId: row.id,
      label: `${row.period_kind} review · ${row.period_start} — ${row.period_end}`,
      occurredAt: iso(row.submitted_at), authorityClass: "REFLECTION",
    });
  }
  const journeyIds = rows.filter((row) => row.sourceDomain === "JOURNEY_PRACTICE").map((row) => row.sourceEntityId);
  if (journeyIds.length) {
    const result = await client.query<{ id: string; technique: string; completed_at: Date }>(
      `SELECT completion.practice_completion_id AS id, session.technique, completion.completed_at
         FROM journey_practice_completion completion
         JOIN journey_practice_session session
           ON session.practice_session_id = completion.practice_session_id
          AND session.user_id = completion.user_id
        WHERE completion.user_id = $1
          AND completion.practice_completion_id = ANY($2::text[])`,
      [userId, journeyIds],
    );
    for (const row of result.rows) values.set(`JOURNEY_PRACTICE:${row.id}`, {
      domain: "JOURNEY_PRACTICE", entityId: row.id,
      label: `Journey practice · ${row.technique.replaceAll("_", " ")}`,
      occurredAt: iso(row.completed_at), authorityClass: "REFLECTION",
    });
  }
  return values;
}

async function candidates(client: PoolClient, userId: string): Promise<MemoryCandidate[]> {
  const result = await client.query<{
    source_domain: "PERIODIC_REVIEW" | "JOURNEY_PRACTICE";
    source_entity_id: string; source_label: string; source_body: string;
    source_occurred_at: Date; retained_root_id: string | null;
  }>(
    `SELECT source.source_domain, source.source_entity_id, source.source_label,
            source.source_body, source.source_occurred_at, retained.root_id AS retained_root_id
       FROM (
         SELECT 'PERIODIC_REVIEW'::text AS source_domain,
                review.periodic_review_id AS source_entity_id,
                review.period_kind || ' review · ' || review.period_start::text || ' — ' || review.period_end::text AS source_label,
                review.worth_preserving AS source_body,
                review.submitted_at AS source_occurred_at
           FROM periodic_review review
          WHERE review.user_id = $1 AND review.status = 'CURRENT'
            AND review.worth_preserving IS NOT NULL AND length(btrim(review.worth_preserving)) > 0
         UNION ALL
         SELECT 'JOURNEY_PRACTICE'::text,
                completion.practice_completion_id,
                'Journey practice · ' || replace(session.technique, '_', ' '),
                completion.retained_learning_candidate,
                completion.completed_at
           FROM journey_practice_completion completion
           JOIN journey_practice_session session
             ON session.practice_session_id = completion.practice_session_id
            AND session.user_id = completion.user_id
          WHERE completion.user_id = $1
            AND completion.retained_learning_candidate IS NOT NULL
            AND length(btrim(completion.retained_learning_candidate)) > 0
       ) source
       LEFT JOIN memory_item retained
         ON retained.user_id = $1 AND retained.status = 'CURRENT'
        AND retained.source_domain = source.source_domain
        AND retained.source_entity_id = source.source_entity_id
      ORDER BY source.source_occurred_at DESC, source.source_entity_id
      LIMIT 41`,
    [userId],
  );
  return result.rows.map((row) => ({
    candidateId: `${row.source_domain}:${row.source_entity_id}`,
    domain: row.source_domain,
    entityId: row.source_entity_id,
    label: row.source_label,
    occurredAt: iso(row.source_occurred_at),
    authorityClass: "REFLECTION",
    suggestedTitle: row.source_domain === "JOURNEY_PRACTICE" ? "Learning from practice" : "Worth preserving",
    body: row.source_body,
    ...(row.retained_root_id ? { retainedRootId: row.retained_root_id } : {}),
  }));
}

async function trustedNow(client: PoolClient, userId: string, now: string): Promise<MemoryTrustedReference[]> {
  const values: MemoryTrustedReference[] = [];
  const direction = await client.query<{ direction_id: string; statement: string; decided_at: Date }>(
    `SELECT direction_id, statement, decided_at FROM direction_decision
      WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY decided_at DESC LIMIT 1`, [userId],
  );
  if (direction.rows[0]) values.push({
    referenceId: `direction:${direction.rows[0].direction_id}`, owner: "YOU",
    authorityClass: "DECISION", label: "Chosen direction", value: direction.rows[0].statement,
    sourceEntityId: direction.rows[0].direction_id, occurredAt: iso(direction.rows[0].decided_at),
    href: "/today",
  });
  const journey = await client.query<{
    journey_decision_id: string; journey_code: string; capability_code: string;
    starting_technique: string; decided_at: Date;
  }>(
    `SELECT journey_decision_id, journey_code, capability_code, starting_technique, decided_at
       FROM journey_capability_decision WHERE user_id = $1 ORDER BY decided_at DESC LIMIT 1`, [userId],
  );
  if (journey.rows[0]) values.push({
    referenceId: `journey:${journey.rows[0].journey_decision_id}`, owner: "JOURNEY",
    authorityClass: "CURRENT_STATE", label: "Active capability",
    value: journey.rows[0].capability_code.replaceAll("_", " "),
    detail: `${journey.rows[0].journey_code.replaceAll("_", " ")} · starting with ${journey.rows[0].starting_technique.replaceAll("_", " ")}`,
    sourceEntityId: journey.rows[0].journey_decision_id, occurredAt: iso(journey.rows[0].decided_at),
    href: "/journey",
  });
  const calendar = await client.query<{
    id: string; title: string; starts_at: Date; category: string; commitment: string;
  }>(
    `SELECT id, title, starts_at, category, commitment FROM calendar_event
      WHERE user_id = $1 AND ends_at >= $2::timestamptz
      ORDER BY starts_at, id LIMIT 1`, [userId, now],
  );
  if (calendar.rows[0]) values.push({
    referenceId: `calendar:${calendar.rows[0].id}`, owner: "CALENDAR",
    authorityClass: "FACT", label: "Next commitment", value: calendar.rows[0].title,
    detail: `${calendar.rows[0].category} · ${calendar.rows[0].commitment}`,
    sourceEntityId: calendar.rows[0].id, occurredAt: iso(calendar.rows[0].starts_at),
    href: "/calendar",
  });
  return values;
}

function compressed(row: {
  periodic_review_id: string; period_kind: "WEEK" | "MONTH";
  period_start: string; period_end: string; what_mattered: string;
  what_changed: string; carry_forward: string;
}): MemoryCompressedReview {
  return {
    reviewId: row.periodic_review_id, kind: row.period_kind,
    periodStart: row.period_start, periodEnd: row.period_end,
    title: row.period_kind === "MONTH" ? `Month of ${row.period_start.slice(0, 7)}` : `Week of ${row.period_start}`,
    summary: cleanSummary([row.what_mattered, row.what_changed, row.carry_forward]),
    authorityClass: "REFLECTION",
    href: `/reviews?kind=${row.period_kind}&periodStart=${row.period_start}`,
  };
}

async function timeCompression(client: PoolClient, userId: string) {
  const month = await client.query<{
    periodic_review_id: string; period_kind: "MONTH"; period_start: string;
    period_end: string; what_mattered: string; what_changed: string; carry_forward: string;
  }>(
    `SELECT periodic_review_id, period_kind, period_start::text, period_end::text,
            what_mattered, what_changed, carry_forward
       FROM periodic_review
      WHERE user_id = $1 AND period_kind = 'MONTH' AND status = 'CURRENT'
      ORDER BY period_start DESC, periodic_review_id DESC LIMIT 1`, [userId],
  );
  if (!month.rows[0]) return { month: null, weeks: [] };
  const weeks = await client.query<{
    periodic_review_id: string; period_kind: "WEEK"; period_start: string;
    period_end: string; what_mattered: string; what_changed: string; carry_forward: string;
  }>(
    `SELECT periodic_review_id, period_kind, period_start::text, period_end::text,
            what_mattered, what_changed, carry_forward
       FROM periodic_review
      WHERE user_id = $1 AND period_kind = 'WEEK' AND status = 'CURRENT'
        AND period_start >= $2::date AND period_end <= $3::date
      ORDER BY period_start, periodic_review_id LIMIT 6`,
    [userId, month.rows[0].period_start, month.rows[0].period_end],
  );
  return { month: compressed(month.rows[0]), weeks: weeks.rows.map(compressed) };
}

export class PostgresMemoryReader implements MemoryReader {
  private readonly userScope: PostgresUserScope;
  constructor(pool: Pool) { this.userScope = new PostgresUserScope(pool) }

  getOverview(authenticatedUserId: string, command: GetMemoryOverviewCommand): Promise<MemoryOverview> {
    return this.userScope.run(authenticatedUserId, async (client) => {
      const params: unknown[] = [authenticatedUserId];
      let filter = "";
      if (command.kind) { params.push(command.kind); filter += ` AND kind = $${params.length}` }
      if (command.query) {
        params.push(`%${command.query.toLowerCase()}%`);
        filter += ` AND lower(title || ' ' || body) LIKE $${params.length}`;
      }
      const current = await client.query<MemoryRow>(
        `SELECT ${memoryColumns} FROM memory_item
          WHERE user_id = $1 AND status = 'CURRENT'${filter}
          ORDER BY source_occurred_at DESC, root_id LIMIT 101`, params,
      );
      const currentRecords = current.rows.map(memoryItemFromRow);
      const roots = currentRecords.map((row) => row.rootId);
      const historyRows = roots.length ? await client.query<MemoryRow>(
        `SELECT ${memoryColumns} FROM memory_item
          WHERE user_id = $1 AND root_id = ANY($2::text[]) AND status = 'SUPERSEDED'
          ORDER BY root_id, revision DESC`, [authenticatedUserId, roots],
      ) : { rows: [] as MemoryRow[] };
      const histories = new Map<string, MemoryVersion[]>();
      for (const raw of historyRows.rows) {
        const row = memoryItemFromRow(raw);
        const list = histories.get(row.rootId) ?? [];
        list.push({
          itemId: row.itemId, revision: row.revision, kind: row.kind,
          title: row.title, body: row.body, authorityClass: "REFLECTION",
          relationship: row.relationship, ...(row.relatedRootId ? { relatedRootId: row.relatedRootId } : {}),
          status: row.status, retainedAt: row.retainedAt, recordedAt: row.recordedAt,
          ...(row.endedAt ? { endedAt: row.endedAt } : {}),
        });
        histories.set(row.rootId, list);
      }
      const sources = await sourceMap(client, authenticatedUserId, currentRecords);
      const relatedRoots = currentRecords.map((row) => row.relatedRootId).filter((value): value is string => Boolean(value));
      const related = relatedRoots.length ? await client.query<{ root_id: string; title: string }>(
        `SELECT root_id, title FROM memory_item
          WHERE user_id = $1 AND root_id = ANY($2::text[]) AND status = 'CURRENT'`,
        [authenticatedUserId, relatedRoots],
      ) : { rows: [] as Array<{ root_id: string; title: string }> };
      const relatedTitles = new Map(related.rows.map((row) => [row.root_id, row.title]));
      const items: MemoryItem[] = currentRecords.map((row) => ({
        itemId: row.itemId, rootId: row.rootId, revision: row.revision,
        kind: row.kind, title: row.title, body: row.body,
        authorityClass: "REFLECTION", relationship: row.relationship,
        ...(row.relatedRootId ? { relatedRootId: row.relatedRootId } : {}),
        status: "CURRENT", retainedAt: row.retainedAt, recordedAt: row.recordedAt,
        source: sources.get(`${row.sourceDomain}:${row.sourceEntityId}`) ?? {
          domain: row.sourceDomain, entityId: row.sourceEntityId,
          label: "Persisted source record", occurredAt: row.sourceOccurredAt,
          authorityClass: "REFLECTION",
        },
        ...(row.relatedRootId && relatedTitles.get(row.relatedRootId)
          ? { relatedTitle: relatedTitles.get(row.relatedRootId)! } : {}),
        history: histories.get(row.rootId) ?? [],
      }));
      const [trusted, candidateValues, time] = await Promise.all([
        trustedNow(client, authenticatedUserId, command.now),
        candidates(client, authenticatedUserId),
        timeCompression(client, authenticatedUserId),
      ]);
      return {
        ...(command.query ? { query: command.query } : {}),
        ...(command.kind ? { kind: command.kind } : {}),
        trustedNow: trusted,
        candidates: candidateValues,
        items,
        timeCompression: time,
        patterns: [],
      };
    });
  }
}
