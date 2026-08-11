import type { TodayViewModel } from "./types";

export const todaySample: TodayViewModel = {
  demoMode: true,
  dateLabel: "Wednesday, 12 August",
  dayNumber: "12",
  monthLabel: "AUG",
  greeting: "Good morning, Akshay.",
  orientation: "Keep the job. Build the craft. Protect the body. Let capability compound.",
  direction: {
    eyebrow: "CURRENT DIRECTION",
    title: "Build freedom to travel.",
    statement:
      "Create financial stability and the creative independence to document your life and eventually the world by yourself.",
    source: {
      label: "User decision",
      detail: "Personal Constitution · active direction",
      recordedAt: "Confirmed 11 Aug 2026",
      trustClass: "DECISION",
    },
  },
  calendar: [
    {
      id: "work",
      time: "09:00",
      endTime: "18:00",
      title: "Software job",
      detail: "Primary work commitment",
      category: "WORK",
      commitment: "FIXED",
      completed: true,
    },
    {
      id: "gym",
      time: "18:30",
      endTime: "19:30",
      title: "Gym",
      detail: "Body · training",
      category: "BODY",
      commitment: "IMPORTANT",
    },
    {
      id: "sound",
      time: "20:15",
      endTime: "21:00",
      title: "Sound practice",
      detail: "Environmental sound under dialogue",
      category: "CREATOR",
      commitment: "FLEXIBLE",
    },
  ],
  creator: {
    phase: "PHASE 01",
    skill: "Sound Design",
    focus: "Environmental sound",
    intent: "Hear the environment as part of the story—not as noise behind it.",
    evidence: {
      practices: 4,
      reels: 2,
      learnings: 7,
    },
    source: {
      label: "Active decision",
      detail: "Creator Journey · current phase",
      recordedAt: "Confirmed 11 Aug 2026",
      trustClass: "DECISION",
    },
  },
  suggestion: {
    title: "Keep tonight narrow.",
    body: "Stay with environmental sound. One deliberate repetition is more useful tonight than adding another technique.",
    basis: "Based on the active Sound Design phase and today's planned focus. This is guidance, not a decision.",
    source: {
      label: "System suggestion",
      detail: "Prototype reasoning from sample state",
      recordedAt: "Generated for this demo",
      trustClass: "SUGGESTION",
    },
  },
};
