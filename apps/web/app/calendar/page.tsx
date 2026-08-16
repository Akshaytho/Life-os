import "./calendar-overrides.css";
import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LiveCanonicalCalendar } from "../../components/live-canonical-calendar";

export default function CalendarPage() {
  return (
    <LifeOsAuthGate
      area="Calendar"
      title="Sign in before Life OS can read your canonical Calendar."
      description="The browser holds only a normal Supabase user session. The API verifies it again and PostgreSQL RLS still decides which Calendar rows exist for that user."
    >
      <LiveCanonicalCalendar />
    </LifeOsAuthGate>
  );
}
