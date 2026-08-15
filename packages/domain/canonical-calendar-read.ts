import type { CalendarCategory, CalendarCommitment } from "./write-boundary";

export interface CanonicalCalendarRecord {
  id: string;
  userId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  category: CalendarCategory;
  commitment: CalendarCommitment;
  createdAt: string;
  sourceProposalId: string;
}

export interface CanonicalCalendarReader {
  listOverlapping(
    authenticatedUserId: string,
    fromInclusive: string,
    toExclusive: string,
  ): Promise<CanonicalCalendarRecord[]>;
}
