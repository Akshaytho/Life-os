import "./calendar-overrides.css";
import { CalendarDashboard } from "../../components/calendar-dashboard";
import { calendarSample } from "../../lib/calendar-sample-data";

export default function CalendarPage() {
  return <CalendarDashboard model={calendarSample} />;
}
