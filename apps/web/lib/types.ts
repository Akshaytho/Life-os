export type TrustClass = "FACT" | "REFLECTION" | "OBSERVATION" | "SUGGESTION" | "DECISION";

export type SourceRef = {
  label: string;
  detail: string;
  recordedAt: string;
  trustClass: TrustClass;
};

export type CalendarCommitment = "FIXED" | "IMPORTANT" | "FLEXIBLE" | "OPTIONAL";
export type CalendarCategory = "WORK" | "BODY" | "CREATOR" | "FAMILY" | "FRIENDS" | "HEALTH" | "PERSONAL" | "REST" | "TRAVEL" | "LEARNING";
export type TimelineState = "PAST" | "NEXT" | "LATER";

export type CalendarPreviewItem = {
  id: string;
  time: string;
  endTime: string;
  title: string;
  detail: string;
  category: CalendarCategory;
  commitment: CalendarCommitment;
  state: TimelineState;
  weight: "LONG" | "MEDIUM" | "SHORT";
  gapAfter?: string;
};

export type DirectionView = {
  title: string;
  statement: string;
  source: SourceRef;
};

export type FocusItem = {
  id: string;
  label: string;
  reason: string;
  state: "DONE" | "ACTIVE" | "LATER";
};

export type EvidenceStage = {
  label: "Learned" | "Practised" | "Applied" | "Reviewed" | "Repeated";
  state: "COMPLETE" | "ACTIVE" | "NEXT";
};

export type SkillFocusView = {
  journey: string;
  phase: string;
  skill: string;
  technique: string;
  intent: string;
  evidenceStages: EvidenceStage[];
  evidenceCounts: {
    practices: number;
    reels: number;
    learnings: number;
  };
  latestLearning: string;
  nextExperiment: string;
  source: SourceRef;
};

export type SuggestionView = {
  title: string;
  body: string;
  basis: string;
  source: SourceRef;
};

export type TodayViewModel = {
  demoMode: boolean;
  dateLabel: string;
  dayPart: string;
  heading: string;
  orientation: string;
  stateLabel: string;
  direction: DirectionView;
  day: {
    sampleClock: string;
    source: SourceRef;
    items: CalendarPreviewItem[];
  };
  focus: FocusItem[];
  creator: SkillFocusView;
  suggestion: SuggestionView;
  review: {
    label: string;
    title: string;
    prompt: string;
  };
};
