import type { SourceRef } from "./types";

export type CalendarLens = "DAY" | "WEEK" | "MONTH" | "YEAR";
export type CalendarCategory = "Work" | "Creator" | "Learning" | "Health" | "Family" | "Friends" | "Travel" | "Personal" | "Rest";
export type CommitmentLevel = "FIXED" | "IMPORTANT" | "FLEXIBLE" | "OPTIONAL";
export type CalendarStatus = "CONFIRMED" | "TENTATIVE" | "COMPLETED" | "CANCELLED";
export type CalendarOrigin = "USER" | "LIFE_OS_AI" | "EXTERNAL_CALENDAR" | "IMPORT";

export type CalendarEvent = {
  id: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  title: string;
  detail: string;
  category: CalendarCategory;
  commitment: CommitmentLevel;
  status: CalendarStatus;
  origin: CalendarOrigin;
  relatedLabel?: string;
  source: SourceRef;
};

export type WeekDay = {
  date: string;
  day: string;
  number: string;
  occupiedMinutes: number;
  openMinutes: number;
  dominant: CalendarCategory[];
  eventIds: string[];
  note?: string;
};

export type MonthDay = {
  date: string;
  number: number;
  load: 0 | 1 | 2 | 3 | 4;
  categories: CalendarCategory[];
  landmark?: string;
  muted?: boolean;
};

export type YearMonth = {
  label: string;
  short: string;
  load: number;
  categories: CalendarCategory[];
  landmark?: string;
};

export type RoutedIntent = {
  id: string;
  userWords: string;
  interpretation: string;
  destination: "Calendar" | "Travel / NOT NOW" | "Journey + Calendar";
  proposedWhen?: string;
  state: "NEEDS_CONFIRMATION" | "READY_TO_CONFIRM" | "ROUTED";
  reason: string;
};

export type CalendarViewModel = {
  demoMode: boolean;
  dateLabel: string;
  dayTitle: string;
  now: string;
  timezone: string;
  events: CalendarEvent[];
  week: WeekDay[];
  month: {
    label: string;
    days: MonthDay[];
  };
  year: {
    label: string;
    months: YearMonth[];
  };
  routedIntents: RoutedIntent[];
};
