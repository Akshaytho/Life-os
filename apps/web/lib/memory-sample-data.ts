import type { MemoryViewModel } from "./memory-types";

export const memorySample: MemoryViewModel = {
  demoMode: true,
  recallPrompt: "Why did I keep Sound Design active?",
  recallExplanation:
    "Memory would begin with the active decision, then expand through review summaries and source evidence—not simply return the newest matching sentence.",
  anchors: [
    {
      id: "direction",
      label: "CHOSEN DIRECTION",
      value: "Build a financial + creative foundation for long-term travel.",
      detail: "A durable direction reference. Memory can recall it; You remains the canonical owner.",
      owner: "YOU",
      authority: "DECISION",
      source: {
        label: "Direction decision",
        detail: "Explicit user decision",
        recordedAt: "08 AUG 2026",
      },
    },
    {
      id: "capability",
      label: "ACTIVE CAPABILITY",
      value: "Sound Design",
      detail: "Current capability inside the Travel Creator journey.",
      owner: "JOURNEY",
      authority: "CURRENT STATE",
      source: {
        label: "Journey state",
        detail: "Active capability decision",
        recordedAt: "11 AUG 2026",
      },
      href: "/journey/travel-creator/sound-design",
    },
    {
      id: "commitment",
      label: "NEXT MEANINGFUL COMMITMENT",
      value: "Gym · Thursday 19:00",
      detail: "A confirmed time-bound fact. The deeper reason for training does not belong to Calendar.",
      owner: "CALENDAR",
      authority: "FACT",
      source: {
        label: "Calendar plan",
        detail: "Important · Health",
        recordedAt: "14 AUG 2026",
      },
      href: "/calendar",
    },
  ],
  memories: [
    {
      id: "learning-location-bed",
      kind: "LEARNING",
      date: "11 AUG",
      title: "A place needs separation, not simply more sound layers.",
      summary: "The useful learning was about foreground, environment and distance working together rather than stacking volume.",
      authority: "REFLECTION",
      source: {
        label: "Sound Design practice 04",
        detail: "User-retained learning",
        recordedAt: "11 AUG 2026",
      },
    },
    {
      id: "experience-open-evening",
      kind: "EXPERIENCE",
      date: "09 AUG",
      title: "An intentionally open evening stayed open.",
      summary: "The day was not treated as failed simply because creator work did not occupy the available evening.",
      authority: "FACT",
      source: {
        label: "Daily review",
        detail: "Calendar + user review",
        recordedAt: "09 AUG 2026",
      },
    },
    {
      id: "reflection-repetition",
      kind: "REFLECTION",
      date: "07 AUG",
      title: "Repeating one technique felt more useful than collecting new topics.",
      summary: "This remains a reflection about learning pace, not an automatic change to Journey structure.",
      authority: "REFLECTION",
      source: {
        label: "Learning reflection",
        detail: "User-authored reflection",
        recordedAt: "07 AUG 2026",
      },
    },
  ],
  month: {
    label: "AUGUST 2026",
    title: "Foundation stayed stable while practice became more applied.",
    summary:
      "This compressed month view keeps only the changes worth carrying forward. Calendar still owns the actual hours; Journey owns capability evidence; this summary exists so long-range recall does not require reading every day again.",
    authority: "DERIVED SUMMARY",
    source: {
      label: "Monthly review compression",
      detail: "Derived from weekly + daily reviews",
      recordedAt: "SAMPLE · IN PROGRESS",
    },
    weeks: [
      {
        id: "week-1",
        range: "03–09 AUG",
        title: "Rhythm recovered without forcing every open hour.",
        summary: "Work remained fixed; one learning reflection and one deliberate rest/social evening were worth preserving.",
        signals: ["work reality", "reflection", "rest"],
      },
      {
        id: "week-2",
        range: "10–16 AUG",
        title: "Sound practice moved from collecting ideas to application.",
        summary: "Location sound moved into a reel experiment and retained learning became more specific.",
        signals: ["practice", "reel evidence", "learning"],
      },
      {
        id: "week-3",
        range: "17–23 AUG",
        title: "Not reviewed yet.",
        summary: "Future periods stay quiet rather than being filled with invented summaries.",
        signals: [],
      },
      {
        id: "week-4",
        range: "24–31 AUG",
        title: "Not reviewed yet.",
        summary: "Memory compression appears only when evidence actually exists.",
        signals: [],
      },
    ],
  },
  patterns: [
    {
      id: "pattern-application",
      title: "Practice becomes more concrete when attached to a real output.",
      statement:
        "Across the synthetic evidence window, technique work became easier to review once it was attached to a reel or location experiment rather than an abstract session.",
      evidenceWindow: "4 WEEKS",
      evidence: "6 linked evidence records",
      authority: "DERIVED PATTERN",
      source: {
        label: "Pattern synthesis",
        detail: "Learning sessions + reel evidence",
        recordedAt: "13 AUG 2026",
      },
    },
    {
      id: "pattern-work-shift",
      title: "Fixed work changed timing more often than it erased the plan.",
      statement:
        "The synthetic calendar/review sample suggests creator work tended to move later or become smaller when work expanded. This is an observation to inspect, not a rule about the user.",
      evidenceWindow: "3 WEEKS",
      evidence: "calendar + review evidence",
      authority: "DERIVED PATTERN",
      source: {
        label: "Pattern synthesis",
        detail: "Calendar pressure + daily reviews",
        recordedAt: "13 AUG 2026",
      },
    },
  ],
};
