import type { JourneyViewModel } from "./journey-types";

const decisionSource = {
  label: "Your decision",
  detail: "Active creator journey · structured prototype state",
  recordedAt: "Confirmed 11 Aug 2026",
  trustClass: "DECISION" as const,
};

export const journeySample: JourneyViewModel = {
  demoMode: true,
  journey: {
    title: "Travel Creator",
    statement: "Become capable of shooting, directing, editing, and telling stories independently while keeping life financially grounded.",
    source: decisionSource,
    phases: [
      { id: "sound", index: "01", label: "Sound Design", shortLabel: "Sound", state: "ACTIVE" },
      { id: "editing", index: "02", label: "Editing Rhythm", shortLabel: "Edit", state: "FUTURE" },
      { id: "framing", index: "03", label: "Framing & Composition", shortLabel: "Frame", state: "FUTURE" },
      { id: "movement", index: "04", label: "Camera Movement", shortLabel: "Move", state: "FUTURE" },
      { id: "direction", index: "05", label: "Story Direction", shortLabel: "Direct", state: "FUTURE" },
      { id: "solo", index: "06", label: "Solo Production System", shortLabel: "Solo", state: "FUTURE" },
    ],
  },
  activeSkill: {
    phaseLabel: "01 / ACTIVE CAPABILITY",
    title: "Sound Design",
    intent: "Learn to make a place audible enough that sound carries part of the story before another creator skill becomes active.",
    source: decisionSource,
    activeTechnique: {
      id: "environment",
      label: "Environmental sound",
      cue: "Hear the place as story, not background noise.",
      state: "ACTIVE",
    },
    techniques: [
      { id: "environment", label: "Environmental sound", cue: "Place", state: "ACTIVE" },
      { id: "jl", label: "J / L cuts", cue: "Continuity", state: "AVAILABLE" },
      { id: "dialogue", label: "Dialogue clarity", cue: "Voice", state: "AVAILABLE" },
      { id: "music", label: "Music relationship", cue: "Emotion", state: "AVAILABLE" },
      { id: "silence", label: "Silence", cue: "Contrast", state: "AVAILABLE" },
      { id: "effects", label: "Sound effects", cue: "Detail", state: "AVAILABLE" },
      { id: "layering", label: "Layering", cue: "Depth", state: "AVAILABLE" },
    ],
    evidence: [
      { label: "Learned", state: "COMPLETE", marks: 3 },
      { label: "Practised", state: "COMPLETE", marks: 4 },
      { label: "Applied", state: "COMPLETE", marks: 2 },
      { label: "Reviewed", state: "ACTIVE", marks: 1 },
      { label: "Repeated", state: "NEXT", marks: 0 },
    ],
    evidenceCounts: {
      sessions: 4,
      reels: 2,
      learnings: 7,
      reviews: 1,
    },
  },
  practices: [
    {
      id: "p04",
      date: "11 AUG",
      number: "04",
      experiment: "Three-layer location bed",
      duration: "28 min",
      learning: "Movement becomes easier to feel when room tone stays underneath it.",
    },
    {
      id: "p03",
      date: "09 AUG",
      number: "03",
      experiment: "Ambient sound under dialogue",
      duration: "24 min",
      learning: "Flat ambience makes the location feel pasted on instead of lived in.",
    },
    {
      id: "p02",
      date: "07 AUG",
      number: "02",
      experiment: "One signature location detail",
      duration: "18 min",
      learning: "A single recognizable sound can identify the place faster than extra music.",
    },
  ],
  reels: [
    {
      id: "reel-02",
      title: "Evening street study",
      code: "REEL / 02",
      stage: "REVIEWED",
      technique: "Environmental sound",
      personalReview: "DONE",
      externalAnalysis: "RECEIVED",
    },
    {
      id: "reel-01",
      title: "Room-to-street transition",
      code: "REEL / 01",
      stage: "PUBLISHED",
      technique: "Environmental sound",
      personalReview: "DONE",
      externalAnalysis: "NOT_REQUESTED",
    },
  ],
  learnings: [
    {
      id: "learning-01",
      text: "An ambient bed feels intentional when it changes with the place instead of staying flat under the whole reel.",
      evidence: "Practice 03 + Reel 02",
      source: {
        label: "Your reflection",
        detail: "Retained prototype learning from practice and reel review",
        recordedAt: "11 Aug 2026",
        trustClass: "REFLECTION",
      },
    },
    {
      id: "learning-02",
      text: "Capture room tone before movement so the edit has a stable acoustic base.",
      evidence: "Practice 04",
      source: {
        label: "Your reflection",
        detail: "Retained prototype learning from practice evidence",
        recordedAt: "11 Aug 2026",
        trustClass: "REFLECTION",
      },
    },
  ],
  externalObservation: {
    title: "The location is audible, but not yet changing enough with the shot.",
    body: "External analysis noticed that the ambience stays consistent through visual changes. Treat this as an observation to test, not as canonical truth.",
    source: {
      label: "External analysis",
      detail: "Prototype ChatGPT-style reel observation · kept separate from personal review",
      recordedAt: "Demo analysis",
      trustClass: "OBSERVATION",
    },
  },
  nextExperiment: {
    title: "Make the place change with the camera.",
    instruction: "Record one short sequence with three audio layers — room tone, movement, and one signature detail — then deliberately change one layer when the shot changes.",
    reason: "Repeats the active technique while testing the latest retained learning instead of introducing another technique.",
  },
};
