import type { CanonicalCalendarItem } from "./canonical-calendar";

export type ManualCalendarCategory =
  | "Work"
  | "Creator"
  | "Learning"
  | "Health"
  | "Family"
  | "Friends"
  | "Travel"
  | "Personal"
  | "Rest";

export type ManualCalendarCommitment = "Fixed" | "Important" | "Flexible" | "Optional";

export interface CreateManualCalendarCommitmentCommand {
  title: string;
  startsAt: string;
  endsAt: string;
  category: ManualCalendarCategory;
  commitment: ManualCalendarCommitment;
  confirmation: {
    explicit: boolean;
    acknowledgement: "COMMIT_TO_CALENDAR";
  };
}

export interface ManualCalendarCommitmentReceipt {
  status: "created" | "replayed";
  item: CanonicalCalendarItem;
}
