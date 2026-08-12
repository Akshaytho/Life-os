import "./calendar-overrides.css";
import { CalendarDashboard } from "../../components/calendar-dashboard";
import { calendarSample } from "../../lib/calendar-sample-data";
import type { CalendarLens } from "../../lib/calendar-types";

const lensMap: Record<string, CalendarLens> = {
  day: "DAY",
  week: "WEEK",
  month: "MONTH",
  year: "YEAR",
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ lens?: string }> }) {
  const params = await searchParams;
  const activeLens = params.lens ? lensMap[params.lens.toLowerCase()] ?? "DAY" : "DAY";
  return <CalendarDashboard model={calendarSample} activeLens={activeLens} />;
}
