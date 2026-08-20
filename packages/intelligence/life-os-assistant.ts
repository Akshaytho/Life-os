import type {
  AiContextSource,
  AiInteractionMode,
} from "../contracts/ai-retrieval";

export interface LifeOsAssistantInput {
  mode: AiInteractionMode;
  question: string;
  localDate: string;
  timeZone: string;
  sources: AiContextSource[];
}

export interface LifeOsAssistantResult {
  answer: string;
  citedSourceIds: string[];
  modelName: string;
}

export interface LifeOsAssistant {
  answer(input: LifeOsAssistantInput): Promise<LifeOsAssistantResult>;
}
