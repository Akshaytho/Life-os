import { notFound } from "next/navigation";
import type { NotNowItem } from "../../../../../packages/contracts/brain-dump-not-now";
import { LiveNotNow } from "../../../components/live-not-now";

function visualReviewEnabled() {
  return process.env.LIFE_OS_VISUAL_REVIEW_ENABLED?.trim().toLowerCase() === "true";
}

const visualItems: NotNowItem[] = [
  {
    id: "not-now-visual-2",
    rootId: "not-now-visual-1",
    revision: 2,
    captureId: "capture-visual-1",
    rawText: "Maybe I should abandon the stable plan and build an entirely different product this month.",
    source: "WEB_APP",
    category: "NOT_NOW",
    assessment: "TEMPORARY_INSPIRATION",
    posture: "PARK_IT",
    state: "PARKED_NOT_NOW",
    status: "CURRENT",
    authorityClass: "DECISION",
    reviewNote: "Keep the idea visible without switching away from sound practice and financial stability.",
    decidedAt: "2026-08-18T14:30:00.000Z",
    recordedAt: "2026-08-18T14:30:01.000Z",
  },
  {
    id: "not-now-visual-3",
    rootId: "not-now-visual-3",
    revision: 1,
    captureId: "capture-visual-2",
    rawText: "Research whether a short field-recording trip could become evidence for the travel-creator journey.",
    source: "WEB_APP",
    category: "NOT_NOW",
    assessment: "WORTH_RESEARCHING",
    posture: "RESEARCH_WITHOUT_COMMITTING",
    state: "RESEARCHING",
    status: "CURRENT",
    authorityClass: "DECISION",
    decidedAt: "2026-08-17T10:00:00.000Z",
    recordedAt: "2026-08-17T10:00:01.000Z",
  },
];

export default function NotNowVisualReviewPage() {
  if (!visualReviewEnabled()) notFound();
  return <LiveNotNow visualItems={visualItems} />;
}
