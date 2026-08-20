import type {
  JourneyPracticeOverview,
  JourneyPracticeSession,
} from "../../../packages/contracts/journey-practice";
import type { JourneyPracticeReader } from "../../../packages/domain/journey-practice-read";
import { requiredJourneyOpaqueId } from "./journey-practice-validation";

export async function getJourneyPracticeOverview(
  untrustedUserId: string,
  reader: JourneyPracticeReader,
): Promise<JourneyPracticeOverview> {
  const userId = requiredJourneyOpaqueId(untrustedUserId, "INVALID_PRINCIPAL");
  const snapshot = await reader.getSnapshot(userId, 100);
  const activation = snapshot.activation ? {
    decisionId: snapshot.activation.decisionId,
    journeyCode: snapshot.activation.journeyCode,
    capabilityCode: snapshot.activation.capabilityCode,
    startingTechnique: snapshot.activation.startingTechnique,
    ...(snapshot.activation.decisionReason
      ? { decisionReason: snapshot.activation.decisionReason }
      : {}),
    authorityClass: "DECISION" as const,
    decidedAt: snapshot.activation.decidedAt,
    recordedAt: snapshot.activation.recordedAt,
  } : null;
  const counts: JourneyPracticeOverview["practiceCounts"] = {};
  const sessions: JourneyPracticeSession[] = snapshot.sessions.map(({ session, completion }) => {
    if (completion) {
      counts[session.technique] = (counts[session.technique] ?? 0) + 1;
    }
    return {
      sessionId: session.sessionId,
      technique: session.technique,
      ...(session.experimentIntention ? { experimentIntention: session.experimentIntention } : {}),
      authorityClass: "FACT",
      startedAt: session.startedAt,
      recordedAt: session.recordedAt,
      lifecycleState: completion ? "COMPLETED" : "ACTIVE",
      completion: completion ? {
        completionId: completion.completionId,
        ...(completion.reflectionNote ? { reflectionNote: completion.reflectionNote } : {}),
        ...(completion.retainedLearningCandidate
          ? { retainedLearningCandidate: completion.retainedLearningCandidate }
          : {}),
        reflectionAuthorityClass: "REFLECTION",
        completedAt: completion.completedAt,
        recordedAt: completion.recordedAt,
        durationSeconds: Math.max(0, Math.floor(
          (Date.parse(completion.completedAt) - Date.parse(session.startedAt)) / 1000,
        )),
      } : null,
    };
  });
  return {
    activation,
    openSession: sessions.find((session) => session.lifecycleState === "ACTIVE") ?? null,
    completedSessions: sessions.filter((session) => session.lifecycleState === "COMPLETED"),
    practiceCounts: counts,
  };
}
