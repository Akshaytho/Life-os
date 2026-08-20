export const journeyCodes = ["TRAVEL_CREATOR"] as const;
export type JourneyCode = typeof journeyCodes[number];

export const journeyCapabilityCodes = ["SOUND_DESIGN"] as const;
export type JourneyCapabilityCode = typeof journeyCapabilityCodes[number];

export const soundDesignTechniqueCodes = [
  "ENVIRONMENTAL_SOUND",
  "J_L_CUTS",
  "DIALOGUE_CLARITY",
  "MUSIC_RELATIONSHIP",
  "SILENCE",
  "SOUND_EFFECTS",
  "LAYERING",
] as const;
export type SoundDesignTechniqueCode = typeof soundDesignTechniqueCodes[number];

export interface JourneyCapabilityDecision {
  decisionId: string;
  journeyCode: JourneyCode;
  capabilityCode: JourneyCapabilityCode;
  startingTechnique: SoundDesignTechniqueCode;
  decisionReason?: string;
  authorityClass: "DECISION";
  decidedAt: string;
  recordedAt: string;
}

export interface JourneyPracticeCompletion {
  completionId: string;
  reflectionNote?: string;
  retainedLearningCandidate?: string;
  reflectionAuthorityClass: "REFLECTION";
  completedAt: string;
  recordedAt: string;
  durationSeconds: number;
}

export interface JourneyPracticeSession {
  sessionId: string;
  technique: SoundDesignTechniqueCode;
  experimentIntention?: string;
  authorityClass: "FACT";
  startedAt: string;
  recordedAt: string;
  lifecycleState: "ACTIVE" | "COMPLETED";
  completion: JourneyPracticeCompletion | null;
}

export interface JourneyPracticeOverview {
  activation: JourneyCapabilityDecision | null;
  openSession: JourneyPracticeSession | null;
  completedSessions: JourneyPracticeSession[];
  practiceCounts: Partial<Record<SoundDesignTechniqueCode, number>>;
}

export interface ActivateJourneyCommand {
  journeyCode: JourneyCode;
  capabilityCode: JourneyCapabilityCode;
  startingTechnique: SoundDesignTechniqueCode;
  decisionReason?: string;
}

export interface StartJourneyPracticeCommand {
  technique: SoundDesignTechniqueCode;
  experimentIntention?: string;
}

export interface CompleteJourneyPracticeCommand {
  reflectionNote?: string;
  retainedLearningCandidate?: string;
}

export interface ActivateJourneyReceipt extends JourneyCapabilityDecision {
  idempotentReplay: boolean;
}

export interface StartJourneyPracticeReceipt {
  sessionId: string;
  lifecycleState: "ACTIVE";
  technique: SoundDesignTechniqueCode;
  authorityClass: "FACT";
  startedAt: string;
  recordedAt: string;
  idempotentReplay: boolean;
}

export interface CompleteJourneyPracticeReceipt {
  sessionId: string;
  completionId: string;
  lifecycleState: "COMPLETED";
  technique: SoundDesignTechniqueCode;
  authorityClass: "FACT";
  reflectionAuthorityClass: "REFLECTION";
  startedAt: string;
  completedAt: string;
  recordedAt: string;
  durationSeconds: number;
  idempotentReplay: boolean;
}
