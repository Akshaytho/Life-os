import type {
  DriftDecisionRevision,
  DriftOverview,
} from "../../../packages/contracts/drift-return";
import type { DriftDecisionRecord } from "../../../packages/domain/drift-return";
import type { DriftReader } from "../../../packages/domain/drift-return-read";
import { DriftError, requiredDriftOpaqueId } from "./drift-return-validation";

const readLimit = 100;

function decisionRevision(record: DriftDecisionRecord): DriftDecisionRevision {
  return {
    decisionId: record.decisionId,
    rootDecisionId: record.rootDecisionId,
    revision: record.revision,
    explanation: record.explanation,
    ...(record.triggerNote ? { triggerNote: record.triggerNote } : {}),
    ...(record.emotionNote ? { emotionNote: record.emotionNote } : {}),
    ...(record.distractionNote ? { distractionNote: record.distractionNote } : {}),
    ...(record.returnPosture ? { returnPosture: record.returnPosture } : {}),
    lifecycleState: record.lifecycleState,
    status: record.status,
    authorityClass: "DECISION",
    decidedAt: record.decidedAt,
    recordedAt: record.recordedAt,
    ...(record.endedAt ? { endedAt: record.endedAt } : {}),
  };
}

export async function getDriftOverview(
  authenticatedUserId: string,
  reader: DriftReader,
): Promise<DriftOverview> {
  const userId = requiredDriftOpaqueId(authenticatedUserId, "INVALID_PRINCIPAL");
  const rows = await reader.listCurrent(userId, readLimit + 1);
  if (rows.length > readLimit) throw new DriftError("INVALID_DRIFT");

  return {
    items: rows.map(({ occurrence, decisions }) => {
      const history = [...decisions].sort((a, b) => b.revision - a.revision).map(decisionRevision);
      const currentDecision = history.find((decision) => decision.status === "CURRENT") ?? null;
      return {
        driftId: occurrence.driftId,
        ...(occurrence.sourceNote ? { sourceNote: occurrence.sourceNote } : {}),
        authorityClass: "USER_SOURCE" as const,
        occurredAt: occurrence.occurredAt,
        recordedAt: occurrence.recordedAt,
        lifecycleState: currentDecision?.lifecycleState ?? "RECORDED",
        currentDecision,
        decisionHistory: history,
      };
    }),
  };
}
