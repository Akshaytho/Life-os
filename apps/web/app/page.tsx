import { LiveToday } from "../components/live-today";
import { TodayDashboard } from "../components/today-dashboard";
import { todaySample } from "../lib/sample-data";

function liveBrowserTodayConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_LIFE_OS_API_BASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

export default function TodayPage() {
  if (liveBrowserTodayConfigured()) return <LiveToday />;
  return <TodayDashboard model={todaySample} />;
}
