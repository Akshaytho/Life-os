export type ReturnObservation = {
  id: string;
  label: string;
  detail: string;
  basis: string;
};

export type ReturnChoice = {
  id: "CONTINUE" | "PARK" | "EXPLORE" | "RECONSIDER";
  title: string;
  consequence: string;
  boundary: string;
  sampleSelected?: boolean;
};

export const returnSystemSample = {
  source: {
    text: "I saw another creator using amazing camera movement and now I want to stop Sound Design and switch immediately.",
    recordedAt: "13 AUG · 21:18",
    authority: "USER SOURCE" as const,
  },
  currentTruth: {
    owner: "JOURNEY" as const,
    label: "ACTIVE CAPABILITY",
    value: "Sound Design",
    detail: "Environmental Sound · Review → repeat",
    authority: "CURRENT STATE" as const,
    href: "/journey/travel-creator/sound-design",
  },
  observations: [
    {
      id: "inspiration",
      label: "Temporary inspiration may be present",
      detail: "A new technique appeared immediately attractive, but the Capture does not contain a prior decision to change capability.",
      basis: "new external stimulus + immediate switch language",
    },
    {
      id: "comparison",
      label: "Comparison may be adding urgency",
      detail: "The impulse is framed around what another creator is doing. That can be useful evidence without becoming a verdict about your path.",
      basis: "explicit comparison in source",
    },
  ] satisfies ReturnObservation[],
  choices: [
    {
      id: "CONTINUE",
      title: "Continue",
      consequence: "Return to the current Sound Design path. Preserve the source as history without activating a new project.",
      boundary: "No new Journey or direction record.",
    },
    {
      id: "PARK",
      title: "Park",
      consequence: "Keep Camera Movement as a NOT NOW idea so it remains retrievable without competing for current attention.",
      boundary: "Idea stays inactive until deliberate review.",
      sampleSelected: true,
    },
    {
      id: "EXPLORE",
      title: "Explore",
      consequence: "Allow a bounded question or experiment without declaring a new capability or direction.",
      boundary: "Exploration is not promotion.",
    },
    {
      id: "RECONSIDER",
      title: "Reconsider",
      consequence: "Open a deliberate review of the active capability decision and compare alternatives with context.",
      boundary: "Review still cannot supersede an active decision automatically.",
    },
  ] satisfies ReturnChoice[],
  parkedPreview: {
    title: "Camera Movement",
    state: "NOT NOW" as const,
    reason: "Interesting enough to preserve; not chosen as active capability.",
  },
  returnPoint: {
    label: "RETURN POINT",
    title: "Resume the current Sound Design experiment.",
    detail: "Environmental Sound · Make the place change with the camera, then review what the sound bed actually adds.",
    href: "/journey/travel-creator/sound-design",
  },
};
