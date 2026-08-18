import type {
  JourneyCapabilityCode,
  JourneyCode,
  SoundDesignTechniqueCode,
} from "../contracts/journey-practice";
import type { WriteRequestContext, WriteSource } from "./write-boundary";

export interface JourneyCapabilityDecisionRecord {
  decisionId: string;
  userId: string;
  journeyCode: JourneyCode;
  capabilityCode: JourneyCapabilityCode;
  startingTechnique: SoundDesignTechniqueCode;
  decisionReason?: string;
  decidedAt: string;
  recordedAt: string;
  correlationId: string;
  source: WriteSource;
  requestId: string;
  requestFingerprint: string;
}

export interface JourneyPracticeSessionRecord {
  sessionId: string;
  userId: string;
  decisionId: string;
  technique: SoundDesignTechniqueCode;
  experimentIntention?: string;
  startedAt: string;
  recordedAt: string;
  correlationId: string;
  source: WriteSource;
  requestId: string;
  requestFingerprint: string;
}

export interface JourneyPracticeCompletionRecord {
  completionId: string;
  sessionId: string;
  userId: string;
  reflectionNote?: string;
  retainedLearningCandidate?: string;
  completedAt: string;
  recordedAt: string;
  correlationId: string;
  source: WriteSource;
  requestId: string;
  requestFingerprint: string;
}

interface JourneyEventBase {
  eventId: string;
  userId: string;
  occurredAt: string;
  recordedAt: string;
  actorType: "USER";
  actorId: string;
  source: WriteSource;
  correlationId: string;
  schemaVersion: 1;
}

export type JourneyPracticeDomainEventRecord =
  | (JourneyEventBase & {
      eventType: "JOURNEY_CAPABILITY_ACTIVATED";
      entityType: "journey_capability_decision";
      entityId: string;
      payloadJson: {
        journeyCode: JourneyCode;
        capabilityCode: JourneyCapabilityCode;
        startingTechnique: SoundDesignTechniqueCode;
        authorityClass: "DECISION";
        hasDecisionReason: boolean;
      };
    })
  | (JourneyEventBase & {
      eventType: "JOURNEY_PRACTICE_STARTED";
      entityType: "journey_practice_session";
      entityId: string;
      payloadJson: {
        decisionId: string;
        journeyCode: JourneyCode;
        capabilityCode: JourneyCapabilityCode;
        technique: SoundDesignTechniqueCode;
        lifecycleState: "ACTIVE";
        authorityClass: "FACT";
        hasExperimentIntention: boolean;
      };
    })
  | (JourneyEventBase & {
      eventType: "JOURNEY_PRACTICE_COMPLETED";
      entityType: "journey_practice_session";
      entityId: string;
      payloadJson: {
        completionId: string;
        decisionId: string;
        journeyCode: JourneyCode;
        capabilityCode: JourneyCapabilityCode;
        technique: SoundDesignTechniqueCode;
        lifecycleState: "COMPLETED";
        authorityClass: "FACT";
        reflectionAuthorityClass: "REFLECTION";
        durationSeconds: number;
        hasReflection: boolean;
        hasRetainedLearningCandidate: boolean;
      };
    });

export interface JourneyPracticeTransaction {
  findActivationByRequestId(requestId: string, userId: string): Promise<JourneyCapabilityDecisionRecord | undefined>;
  getCurrentActivation(userId: string): Promise<JourneyCapabilityDecisionRecord | undefined>;
  createActivation(record: JourneyCapabilityDecisionRecord): Promise<void>;
  findSessionByRequestId(requestId: string, userId: string): Promise<JourneyPracticeSessionRecord | undefined>;
  getOpenSession(userId: string): Promise<JourneyPracticeSessionRecord | undefined>;
  getSession(sessionId: string, userId: string): Promise<JourneyPracticeSessionRecord | undefined>;
  createSession(record: JourneyPracticeSessionRecord): Promise<void>;
  findCompletionByRequestId(requestId: string, userId: string): Promise<JourneyPracticeCompletionRecord | undefined>;
  getCompletion(sessionId: string, userId: string): Promise<JourneyPracticeCompletionRecord | undefined>;
  createCompletion(record: JourneyPracticeCompletionRecord): Promise<void>;
  appendDomainEvent(event: JourneyPracticeDomainEventRecord): Promise<void>;
}

export interface JourneyPracticeUnitOfWork {
  run<T>(authenticatedUserId: string, work: (transaction: JourneyPracticeTransaction) => Promise<T>): Promise<T>;
}

export interface JourneyPracticeIdGenerator {
  next(prefix: "journey-decision" | "practice-session" | "practice-completion" | "event"): string;
}

export interface JourneyPracticeClock {
  now(): string;
}

export type JourneyPracticeRequestContext = WriteRequestContext;
