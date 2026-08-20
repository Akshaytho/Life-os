import { LifeOsAuthGate } from "../../../../components/life-os-auth-gate";
import { LiveJourneyPractice } from "../../../../components/live-journey-practice";

export default function SoundDesignJourneyPage() {
  return (
    <LifeOsAuthGate
      area="Journey / Sound Design"
      title="Sign in before Life OS can read or record private Sound Design practice."
      description="Only canonical practice evidence appears here. Sample sessions, progress percentages, and invented mastery remain excluded."
    >
      <LiveJourneyPractice />
    </LifeOsAuthGate>
  );
}
