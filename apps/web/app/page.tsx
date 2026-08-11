import { TodayDashboard } from "../components/today-dashboard";
import { todaySample } from "../lib/sample-data";

export default function TodayPage() {
  return <TodayDashboard model={todaySample} />;
}
