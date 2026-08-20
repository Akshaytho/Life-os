import { notFound } from "next/navigation";
import type { PeriodicReviewOverview } from "../../../../../packages/contracts/periodic-reviews";
import { LivePeriodicReviews } from "../../../components/live-periodic-reviews";

const fixture: PeriodicReviewOverview = {
  kind: "WEEK", periodStart: "2026-08-17", periodEnd: "2026-08-23", timeZone: "Asia/Kolkata",
  previousPeriodStart: "2026-08-10", nextPeriodStart: "2026-08-24",
  currentReview: {
    id: "periodic-review-visual", kind: "WEEK", periodStart: "2026-08-17", periodEnd: "2026-08-23",
    timeZone: "Asia/Kolkata", whatMattered: "Direction stayed visible while work and ordinary life remained real.",
    whatChanged: "Returning became smaller and less dramatic.",
    whatMovedForward: "Two deliberate Sound Design experiments created factual practice evidence.",
    driftAndReturn: "Comparison pulled toward a new plan; I contained it and returned to the chosen capability.",
    whatWasLearned: "Short environmental-sound comparisons make technique differences easier to hear.",
    carryForward: "Repeat one small experiment before expanding the plan.",
    worthPreserving: "Reliable return matters more than a perfectly clean week.",
    status: "CURRENT", authorityClass: "REFLECTION", submittedAt: "2026-08-23T18:00:00.000Z",
    recordedAt: "2026-08-23T18:00:01.000Z",
  },
  reviewHistory: [],
  sourceCounts: { dailyLogEntries: 3, dailyReviews: 2, calendarEvents: 6, scheduledMinutes: 2580, journeyPractices: 2, driftOccurrences: 1, notNowItems: 1, weeklyReviews: 0 },
  sources: [
    { sourceId: "cal-1", domain: "CALENDAR", authorityClass: "FACT", title: "Software work", excerpt: "Work · Fixed", occurredAt: "2026-08-19T04:00:00.000Z" },
    { sourceId: "log-1", domain: "DAILY_RETURN", authorityClass: "REFLECTION", title: "Daily note · Aug 19", excerpt: "Comparison pulled at the plan; I returned to the smaller Sound Design experiment.", occurredAt: "2026-08-19T12:00:00.000Z" },
    { sourceId: "drift-1", domain: "DRIFT", authorityClass: "DECISION", title: "Drift understanding and return posture", excerpt: "Comparison · return to direction · resolved", occurredAt: "2026-08-19T12:20:00.000Z" },
    { sourceId: "journey-1", domain: "JOURNEY", authorityClass: "FACT", title: "Practice · Environmental Sound", excerpt: "Compare room tone with and without a deliberate ambient layer.", occurredAt: "2026-08-20T14:00:00.000Z" },
    { sourceId: "not-now-1", domain: "NOT_NOW", authorityClass: "DECISION", title: "NOT NOW · Keep Contained", excerpt: "A different creator plan stays preserved without becoming active.", occurredAt: "2026-08-21T09:00:00.000Z" },
  ],
};

export default function PeriodicReviewsVisualPage() {
  if (process.env.LIFE_OS_VISUAL_REVIEW_ENABLED?.trim().toLowerCase() !== "true") notFound();
  return <LivePeriodicReviews visualOverview={fixture} />;
}
