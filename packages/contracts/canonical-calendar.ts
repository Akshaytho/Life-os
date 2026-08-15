export interface CanonicalCalendarItem {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  category: "Work" | "Creator" | "Learning" | "Health" | "Family" | "Friends" | "Travel" | "Personal" | "Rest";
  commitment: "Fixed" | "Important" | "Flexible" | "Optional";
  authorityClass: "FACT";
  committedAt: string;
}

export interface CanonicalCalendarWindow {
  from: string;
  to: string;
  items: CanonicalCalendarItem[];
}
