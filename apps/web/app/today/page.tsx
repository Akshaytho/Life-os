import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LiveToday } from "../../components/live-today";

function dailyReturnConfigured() {
  return process.env.NEXT_PUBLIC_LIFE_OS_DAILY_RETURN_ENABLED?.trim().toLowerCase() === "true";
}
function compositionConfigured() {
  const value = process.env.NEXT_PUBLIC_LIFE_OS_TODAY_COMPOSITION_ENABLED?.trim().toLowerCase();
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("NEXT_PUBLIC_LIFE_OS_TODAY_COMPOSITION_ENABLED must be true or false");
}

export default function TodayPage() {
  return (
    <LifeOsAuthGate
      area="Today"
      title="Sign in before Life OS can read your Today state."
      description="Today reads canonical owners only after the API verifies your Supabase session and PostgreSQL RLS private scope. It never substitutes sample personal state."
    >
      <LiveToday compositionEnabled={compositionConfigured()} dailyReturnEnabled={dailyReturnConfigured()} />
    </LifeOsAuthGate>
  );
}
