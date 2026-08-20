import { notFound } from "next/navigation";
import type { DriftOccurrence } from "../../../../../packages/contracts/drift-return";
import { LiveDrift } from "../../../components/live-drift";

function visualReviewEnabled() {
  return process.env.LIFE_OS_VISUAL_REVIEW_ENABLED?.trim().toLowerCase() === "true";
}

const visualItems: DriftOccurrence[] = [
  {
    driftId: "drift-visual-recorded",
    sourceNote: "I keep looking at a new product idea instead of finishing the stable work already in front of me.",
    authorityClass: "USER_SOURCE",
    occurredAt: "2026-08-18T15:10:00.000Z",
    recordedAt: "2026-08-18T15:10:01.000Z",
    lifecycleState: "RECORDED",
    currentDecision: null,
    decisionHistory: [],
  },
  {
    driftId: "drift-visual-returning",
    sourceNote: "Comparison made me question whether sound practice and financial stability are moving fast enough.",
    authorityClass: "USER_SOURCE",
    occurredAt: "2026-08-17T12:00:00.000Z",
    recordedAt: "2026-08-17T12:00:01.000Z",
    lifecycleState: "STILL_RETURNING",
    currentDecision: {
      decisionId: "drift-decision-visual-2",
      rootDecisionId: "drift-decision-visual-1",
      revision: 2,
      explanation: "COMPARISON",
      triggerNote: "Seeing someone else's launch timeline.",
      emotionNote: "Restless and behind.",
      distractionNote: "A completely different product direction.",
      returnPosture: "STILL_RETURNING",
      lifecycleState: "STILL_RETURNING",
      status: "CURRENT",
      authorityClass: "DECISION",
      decidedAt: "2026-08-17T12:08:00.000Z",
      recordedAt: "2026-08-17T12:08:01.000Z",
    },
    decisionHistory: [
      {
        decisionId: "drift-decision-visual-2",
        rootDecisionId: "drift-decision-visual-1",
        revision: 2,
        explanation: "COMPARISON",
        triggerNote: "Seeing someone else's launch timeline.",
        emotionNote: "Restless and behind.",
        distractionNote: "A completely different product direction.",
        returnPosture: "STILL_RETURNING",
        lifecycleState: "STILL_RETURNING",
        status: "CURRENT",
        authorityClass: "DECISION",
        decidedAt: "2026-08-17T12:08:00.000Z",
        recordedAt: "2026-08-17T12:08:01.000Z",
      },
      {
        decisionId: "drift-decision-visual-1",
        rootDecisionId: "drift-decision-visual-1",
        revision: 1,
        explanation: "COMPARISON",
        lifecycleState: "UNDERSTOOD",
        status: "SUPERSEDED",
        authorityClass: "DECISION",
        decidedAt: "2026-08-17T12:04:00.000Z",
        recordedAt: "2026-08-17T12:04:01.000Z",
        endedAt: "2026-08-17T12:08:01.000Z",
      },
    ],
  },
  {
    driftId: "drift-visual-resolved",
    sourceNote: "A difficult afternoon made the long-term direction feel wrong for a few hours.",
    authorityClass: "USER_SOURCE",
    occurredAt: "2026-08-16T17:00:00.000Z",
    recordedAt: "2026-08-16T17:00:01.000Z",
    lifecycleState: "RESOLVED",
    currentDecision: {
      decisionId: "drift-decision-visual-4",
      rootDecisionId: "drift-decision-visual-3",
      revision: 2,
      explanation: "EMOTIONAL_REACTION",
      returnPosture: "RETURN_TO_DIRECTION",
      lifecycleState: "RESOLVED",
      status: "CURRENT",
      authorityClass: "DECISION",
      decidedAt: "2026-08-16T17:20:00.000Z",
      recordedAt: "2026-08-16T17:20:01.000Z",
    },
    decisionHistory: [
      {
        decisionId: "drift-decision-visual-4",
        rootDecisionId: "drift-decision-visual-3",
        revision: 2,
        explanation: "EMOTIONAL_REACTION",
        returnPosture: "RETURN_TO_DIRECTION",
        lifecycleState: "RESOLVED",
        status: "CURRENT",
        authorityClass: "DECISION",
        decidedAt: "2026-08-16T17:20:00.000Z",
        recordedAt: "2026-08-16T17:20:01.000Z",
      },
    ],
  },
];

export default function DriftVisualReviewPage() {
  if (!visualReviewEnabled()) notFound();
  return <LiveDrift visualItems={visualItems} />;
}
