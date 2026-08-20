import { notFound } from "next/navigation";
import type { AskLifeOsResponse } from "../../../../../packages/contracts/ai-retrieval";
import { LiveAiRetrieval } from "../../../components/live-ai-retrieval";

function visualReviewEnabled() {
  return process.env.LIFE_OS_VISUAL_REVIEW_ENABLED?.trim().toLowerCase() === "true";
}

const visualResponse: AskLifeOsResponse = {
  mode: "RESET",
  answer: "Your current Direction is still the strongest authority. The recent drift was understood as comparison, and your recorded return posture was to return to that Direction. Today also contains a fixed work commitment, so a small Sound Design experiment is more consistent with the evidence than replacing the plan.",
  answerAuthority: "AI_OBSERVATION",
  citedSourceIds: [
    "direction:visual-current",
    "drift:visual-current:decision",
    "calendar:visual-work",
    "journey:visual-active",
  ],
  sources: [
    {
      sourceId: "direction:visual-current",
      domain: "YOU",
      authorityClass: "DECISION",
      title: "Current direction",
      excerpt: "Build the financial and creative foundation for long-term travel while continuing the software job during the foundation period.",
      occurredAt: "2026-08-12T09:00:00.000Z",
    },
    {
      sourceId: "drift:visual-current:decision",
      domain: "DRIFT",
      authorityClass: "DECISION",
      title: "Current drift understanding",
      excerpt: "COMPARISON · RETURN_TO_DIRECTION · RESOLVED",
      occurredAt: "2026-08-19T09:05:00.000Z",
    },
    {
      sourceId: "calendar:visual-work",
      domain: "CALENDAR",
      authorityClass: "FACT",
      title: "Software work",
      excerpt: "Work · Fixed · 9:30 AM to 5:30 PM",
      occurredAt: "2026-08-19T04:00:00.000Z",
    },
    {
      sourceId: "journey:visual-active",
      domain: "JOURNEY",
      authorityClass: "DECISION",
      title: "Active Journey capability",
      excerpt: "TRAVEL_CREATOR · SOUND_DESIGN · ENVIRONMENTAL_SOUND",
      occurredAt: "2026-08-12T09:00:00.000Z",
    },
    {
      sourceId: "daily-return:visual-recent",
      domain: "REVIEWS",
      authorityClass: "REFLECTION",
      title: "Daily Return · 2026-08-18",
      excerpt: "Work took most of the day. One listening exercise moved forward. Comparison pulled attention away. Return with one small J/L cut experiment.",
      occurredAt: "2026-08-18T18:00:00.000Z",
    },
    {
      sourceId: "not-now:visual-trip:idea",
      domain: "NOT_NOW",
      authorityClass: "USER_SOURCE",
      title: "Parked source idea",
      excerpt: "Maybe switch everything to travel planning this month.",
      occurredAt: "2026-08-18T12:00:00.000Z",
    },
  ],
  generatedAt: "2026-08-19T12:00:00.000Z",
  policyVersion: "ask-life-os-retrieval-v1",
  modelName: "visual-review-model",
};

export default function AskLifeOsVisualReviewPage() {
  if (!visualReviewEnabled()) notFound();
  return (
    <LiveAiRetrieval
      visualQuestion="I feel pulled toward a new plan. What can I return to today?"
      visualResponse={visualResponse}
    />
  );
}
