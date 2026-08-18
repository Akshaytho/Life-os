import { notFound } from "next/navigation";
import type { MemoryOverview } from "../../../../../packages/contracts/memory";
import { LiveMemory } from "../../../components/live-memory";

const fixture: MemoryOverview = {
  trustedNow: [
    { referenceId: "direction:visual", owner: "YOU", authorityClass: "DECISION", label: "Chosen direction", value: "Build a creator life without abandoning ordinary reality.", sourceEntityId: "direction-visual", occurredAt: "2026-08-01T10:00:00.000Z", href: "/today" },
    { referenceId: "journey:visual", owner: "JOURNEY", authorityClass: "CURRENT_STATE", label: "Active capability", value: "SOUND DESIGN", detail: "TRAVEL CREATOR · starting with ENVIRONMENTAL SOUND", sourceEntityId: "journey-visual", occurredAt: "2026-08-10T10:00:00.000Z", href: "/journey" },
    { referenceId: "calendar:visual", owner: "CALENDAR", authorityClass: "FACT", label: "Next commitment", value: "Software work", detail: "Work · Fixed", sourceEntityId: "calendar-visual", occurredAt: "2026-08-20T04:00:00.000Z", href: "/calendar" },
  ],
  candidates: [
    { candidateId: "JOURNEY_PRACTICE:completion-2", domain: "JOURNEY_PRACTICE", entityId: "completion-2", label: "Journey practice · ENVIRONMENTAL SOUND", occurredAt: "2026-08-19T14:30:00.000Z", authorityClass: "REFLECTION", suggestedTitle: "Learning from practice", body: "Short room-tone comparisons make small layering differences easier to hear." },
    { candidateId: "PERIODIC_REVIEW:review-2", domain: "PERIODIC_REVIEW", entityId: "review-2", label: "WEEK review · 2026-08-17 — 2026-08-23", occurredAt: "2026-08-23T18:00:00.000Z", authorityClass: "REFLECTION", suggestedTitle: "Worth preserving", body: "Reliable return matters more than a perfectly clean week." },
  ],
  items: [
    { itemId: "memory-1-v2", rootId: "memory-1", revision: 2, kind: "LEARNING", title: "Room tone reveals layering choices", body: "A short A/B comparison makes environmental layers easier to hear before adding complexity.", authorityClass: "REFLECTION", relationship: "NEW", status: "CURRENT", retainedAt: "2026-08-12T18:00:00.000Z", recordedAt: "2026-08-12T18:00:01.000Z", source: { domain: "JOURNEY_PRACTICE", entityId: "completion-1", label: "Journey practice · ENVIRONMENTAL SOUND", occurredAt: "2026-08-11T14:00:00.000Z", authorityClass: "REFLECTION" }, history: [{ itemId: "memory-1", revision: 1, kind: "LEARNING", title: "Room tone helps", body: "Room tone comparisons help me hear layers.", authorityClass: "REFLECTION", relationship: "NEW", status: "SUPERSEDED", retainedAt: "2026-08-11T14:10:00.000Z", recordedAt: "2026-08-11T14:10:01.000Z", endedAt: "2026-08-12T18:00:01.000Z" }] },
    { itemId: "memory-2", rootId: "memory-2", revision: 1, kind: "REFLECTION", title: "Return can stay small", body: "A return does not need a new plan; one contained action can restore direction.", authorityClass: "REFLECTION", relationship: "REINFORCES", relatedRootId: "memory-1", relatedTitle: "Room tone reveals layering choices", status: "CURRENT", retainedAt: "2026-08-18T18:00:00.000Z", recordedAt: "2026-08-18T18:00:01.000Z", source: { domain: "PERIODIC_REVIEW", entityId: "review-1", label: "WEEK review · 2026-08-10 — 2026-08-16", occurredAt: "2026-08-16T18:00:00.000Z", authorityClass: "REFLECTION" }, history: [] },
  ],
  timeCompression: {
    month: { reviewId: "month-visual", kind: "MONTH", periodStart: "2026-08-01", periodEnd: "2026-08-31", title: "Month of 2026-08", summary: "Direction remained visible while work and ordinary life stayed real · Sound Design practice became smaller and more repeatable · Continue one deliberate comparison before expanding.", authorityClass: "REFLECTION", href: "/reviews?kind=MONTH&periodStart=2026-08-01" },
    weeks: [
      { reviewId: "week-1", kind: "WEEK", periodStart: "2026-08-03", periodEnd: "2026-08-09", title: "Week of 2026-08-03", summary: "Protected the current capability and contained a competing plan.", authorityClass: "REFLECTION", href: "/reviews?kind=WEEK&periodStart=2026-08-03" },
      { reviewId: "week-2", kind: "WEEK", periodStart: "2026-08-10", periodEnd: "2026-08-16", title: "Week of 2026-08-10", summary: "Completed two small environmental-sound comparisons and returned after drift.", authorityClass: "REFLECTION", href: "/reviews?kind=WEEK&periodStart=2026-08-10" },
    ],
  },
  patterns: [],
};

export default function MemoryVisualReviewPage() {
  if (process.env.LIFE_OS_VISUAL_REVIEW_ENABLED?.trim().toLowerCase() !== "true") notFound();
  return <LiveMemory visualOverview={fixture} />;
}
