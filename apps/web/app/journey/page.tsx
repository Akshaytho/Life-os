import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LiveJourneyPractice } from "../../components/live-journey-practice";

export default function JourneyPage() {
  return (
    <LifeOsAuthGate
      area="Journey"
      title="Sign in before Life OS can read or record your private Journey evidence."
      description="Journey activation is an explicit decision. The private API verifies your session and PostgreSQL RLS keeps capability choices, practice, and reflections inside your user scope."
    >
      <LiveJourneyPractice />
    </LifeOsAuthGate>
  );
}
