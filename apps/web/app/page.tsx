import { LifeOsAuthGate } from "../components/life-os-auth-gate";
import { LiveToday } from "../components/live-today";

function dailyReturnConfigured() {
  return process.env.NEXT_PUBLIC_LIFE_OS_DAILY_RETURN_ENABLED?.trim().toLowerCase() === "true";
}

export default function TodayPage() {
  return (
    <LifeOsAuthGate
      area="Today"
      title="Sign in before Life OS can read your Today state."
      description="Today reads canonical Calendar and, when separately enabled, your exact Daily Return reflections only after the API verifies your Supabase session and PostgreSQL RLS private scope."
    >
      <LiveToday dailyReturnEnabled={dailyReturnConfigured()} />
    </LifeOsAuthGate>
  );
}
