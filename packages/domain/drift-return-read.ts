import type { DriftDecisionRecord, DriftOccurrenceRecord } from "./drift-return";

export interface DriftOccurrenceWithDecisions {
  occurrence: DriftOccurrenceRecord;
  decisions: DriftDecisionRecord[];
}

export interface DriftReader {
  listCurrent(userId: string, limit: number): Promise<DriftOccurrenceWithDecisions[]>;
}
