import { LifeOsAuthGate } from "../components/life-os-auth-gate";
import { LiveToday } from "../components/live-today";

export default function TodayPage() {
  return (
    <LifeOsAuthGate
      area="Today"
      title="Sign in before Life OS can read your Today state."
      description="Today is derived from your canonical Calendar only after the API verifies your normal Supabase user session and PostgreSQL RLS applies your private scope."
    >
      <LiveToday />
    </LifeOsAuthGate>
  );
}
