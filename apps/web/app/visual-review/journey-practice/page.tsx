import { notFound } from "next/navigation";
import type { JourneyPracticeOverview } from "../../../../../packages/contracts/journey-practice";
import { LiveJourneyPractice } from "../../../components/live-journey-practice";

function visualReviewEnabled() {
  return process.env.LIFE_OS_VISUAL_REVIEW_ENABLED?.trim().toLowerCase() === "true";
}

const visualOverview: JourneyPracticeOverview = {
  activation: {
    decisionId: "journey-decision-visual",
    journeyCode: "TRAVEL_CREATOR",
    capabilityCode: "SOUND_DESIGN",
    startingTechnique: "ENVIRONMENTAL_SOUND",
    decisionReason: "Build creator capability deliberately while protecting financial stability.",
    authorityClass: "DECISION",
    decidedAt: "2026-08-12T09:00:00.000Z",
    recordedAt: "2026-08-12T09:00:01.000Z",
  },
  openSession: {
    sessionId: "practice-visual-open",
    technique: "J_L_CUTS",
    experimentIntention: "Let the next scene arrive through sound before the picture changes.",
    authorityClass: "FACT",
    startedAt: "2026-08-18T18:20:00.000Z",
    recordedAt: "2026-08-18T18:20:01.000Z",
    lifecycleState: "ACTIVE",
    completion: null,
  },
  completedSessions: [
    {
      sessionId: "practice-visual-complete-2",
      technique: "ENVIRONMENTAL_SOUND",
      experimentIntention: "Record room tone and build one continuous space across three cuts.",
      authorityClass: "FACT",
      startedAt: "2026-08-17T14:00:00.000Z",
      recordedAt: "2026-08-17T14:00:01.000Z",
      lifecycleState: "COMPLETED",
      completion: {
        completionId: "completion-visual-2",
        reflectionNote: "The cut felt calmer when the room tone continued underneath it.",
        retainedLearningCandidate: "Continuity can come from the sound bed before it comes from matching pictures.",
        reflectionAuthorityClass: "REFLECTION",
        completedAt: "2026-08-17T14:42:00.000Z",
        recordedAt: "2026-08-17T14:42:01.000Z",
        durationSeconds: 2520,
      },
    },
    {
      sessionId: "practice-visual-complete-1",
      technique: "SILENCE",
      experimentIntention: "Remove one expected sound and notice where attention moves.",
      authorityClass: "FACT",
      startedAt: "2026-08-15T16:30:00.000Z",
      recordedAt: "2026-08-15T16:30:01.000Z",
      lifecycleState: "COMPLETED",
      completion: {
        completionId: "completion-visual-1",
        reflectionAuthorityClass: "REFLECTION",
        completedAt: "2026-08-15T16:55:00.000Z",
        recordedAt: "2026-08-15T16:55:01.000Z",
        durationSeconds: 1500,
      },
    },
  ],
  practiceCounts: {
    ENVIRONMENTAL_SOUND: 1,
    SILENCE: 1,
  },
};

export default function JourneyPracticeVisualReviewPage() {
  if (!visualReviewEnabled()) notFound();
  return <LiveJourneyPractice visualOverview={visualOverview} />;
}
