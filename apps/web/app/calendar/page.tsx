import "./calendar-overrides.css";
import { CalendarDashboard } from "../../components/calendar-dashboard";
import { LiveCanonicalCalendar } from "../../components/live-canonical-calendar";
import { calendarSample } from "../../lib/calendar-sample-data";
import type { CalendarLens } from "../../lib/calendar-types";

const lensMap: Record<string, CalendarLens> = {
  day: "DAY",
  week: "WEEK",
  month: "MONTH",
  year: "YEAR",
};

function liveBrowserCalendarConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_LIFE_OS_API_BASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ lens?: string }> }) {
  if (liveBrowserCalendarConfigured()) return <LiveCanonicalCalendar />;

  const params = await searchParams;
  const activeLens = params.lens ? lensMap[params.lens.toLowerCase()] ?? "DAY" : "DAY";
  return <CalendarDashboard model={calendarSample} activeLens={activeLens} />;
}
