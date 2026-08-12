import type { SourceRef } from "./types";

export type JourneyPhaseState = "ACTIVE" | "FUTURE" | "COMPLETE" | "PAUSED";
export type TechniqueState = "ACTIVE" | "AVAILABLE" | "PARKED";
export type EvidenceState = "COMPLETE" | "ACTIVE" | "NEXT";

export type JourneyPhase = {
  id: string;
  index: string;
  label: string;
  shortLabel: string;
  state: JourneyPhaseState;
};

export type JourneyTechnique = {
  id: string;
  label: string;
  cue: string;
  state: TechniqueState;
};

export type TechniqueEvidence = {
  label: "Learned" | "Practised" | "Applied" | "Reviewed" | "Repeated";
  state: EvidenceState;
  marks: number;
};

export type PracticeRecord = {
  id: string;
  date: string;
  number: string;
  experiment: string;
  duration: string;
  learning: string;
};

export type ReelEvidence = {
  id: string;
  title: string;
  code: string;
  stage: "SHOT" | "EDITING" | "REVIEWED" | "PUBLISHED";
  technique: string;
  personalReview: "DONE" | "PENDING";
  externalAnalysis: "RECEIVED" | "NOT_REQUESTED" | "PENDING";
};

export type RetainedLearning = {
  id: string;
  text: string;
  evidence: string;
  source: SourceRef;
};

export type JourneyViewModel = {
  demoMode: boolean;
  journey: {
    title: string;
    statement: string;
    source: SourceRef;
    phases: JourneyPhase[];
  };
  activeSkill: {
    phaseLabel: string;
    title: string;
    intent: string;
    source: SourceRef;
    activeTechnique: JourneyTechnique;
    techniques: JourneyTechnique[];
    evidence: TechniqueEvidence[];
    evidenceCounts: {
      sessions: number;
      reels: number;
      learnings: number;
      reviews: number;
    };
  };
  practices: PracticeRecord[];
  reels: ReelEvidence[];
  learnings: RetainedLearning[];
  externalObservation: {
    title: string;
    body: string;
    source: SourceRef;
  };
  nextExperiment: {
    title: string;
    instruction: string;
    reason: string;
  };
};
