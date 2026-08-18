import type {
  JourneyCapabilityDecisionRecord,
  JourneyPracticeCompletionRecord,
  JourneyPracticeSessionRecord,
} from "./journey-practice";

export interface JourneyPracticeSessionWithCompletion {
  session: JourneyPracticeSessionRecord;
  completion?: JourneyPracticeCompletionRecord;
}

export interface JourneyPracticeReadSnapshot {
  activation?: JourneyCapabilityDecisionRecord;
  sessions: JourneyPracticeSessionWithCompletion[];
}

export interface JourneyPracticeReader {
  getSnapshot(userId: string, limit: number): Promise<JourneyPracticeReadSnapshot>;
}
