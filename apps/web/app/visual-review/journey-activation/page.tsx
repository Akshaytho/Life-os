import { notFound } from "next/navigation";
import { LiveJourneyPractice } from "../../../components/live-journey-practice";

function visualReviewEnabled() {
  return process.env.LIFE_OS_VISUAL_REVIEW_ENABLED?.trim().toLowerCase() === "true";
}

export default function JourneyActivationVisualReviewPage() {
  if (!visualReviewEnabled()) notFound();
  return <LiveJourneyPractice visualOverview={{
    activation: null,
    openSession: null,
    completedSessions: [],
    practiceCounts: {},
  }} />;
}
