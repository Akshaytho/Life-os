import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LiveJourney } from "../../components/live-journey";
import { RealDataOnlySurface } from "../../components/real-data-only-surface";

function liveJourneyConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_LIFE_OS_JOURNEY_ENABLED?.trim().toLowerCase() === "true"
    && process.env.NEXT_PUBLIC_LIFE_OS_API_BASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

export default function JourneyPage() {
  if (!liveJourneyConfigured()) {
    return (
      <RealDataOnlySurface
        area="Journey"
        title="Journey will appear only when canonical activation is live."
        description="The Journey decision model exists in code, but this deployment keeps it unavailable until migration, least-privilege database authority and the private runtime switch are activated together. No sample Journey is substituted."
      />
    );
  }

  return (
    <LifeOsAuthGate
      area="Journey"
      title="Sign in before Life OS can read or change your Journey."
      description="Journey uses your normal Supabase user session, while the private API and PostgreSQL RLS independently verify every read and explicit activation decision."
    >
      <LiveJourney />
    </LifeOsAuthGate>
  );
}
