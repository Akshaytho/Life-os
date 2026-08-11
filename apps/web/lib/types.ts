export type TrustClass = "FACT" | "REFLECTION" | "OBSERVATION" | "SUGGESTION" | "DECISION";

export type SourceRef = {
  label: string;
  detail: string;
  recordedAt: string;
  trustClass: TrustClass;
};

export type CalendarCommitment = "FIXED" | "IMPORTANT" | "FLEXIBLE" | "OPTIONAL";

export type CalendarPreviewItem = {
  id: string;
  time: string;
  endTime: string;
  title: string;
  detail: string;
  category: "WORK" | "BODY" | "CREATOR" | "FAMILY" | "FRIENDS" | "HEALTH" | "PERSONAL";
  commitment: CalendarCommitment;
  completed?: boolean;
};

export type DirectionView = {
  eyebrow: string;
  title: string;
  statement: string;
  source: SourceRef;
};

export type SkillFocusView = {
  phase: string;
  skill: string;
  focus: string;
  intent: string;
  evidence: {
    practices: number;
    reels: number;
    learnings: number;
  };
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
  dayNumber: string;
  monthLabel: string;
  greeting: string;
  orientation: string;
  direction: DirectionView;
  calendar: CalendarPreviewItem[];
  creator: SkillFocusView;
  suggestion: SuggestionView;
};
