import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LiveNotNow } from "../../components/live-not-now";

export default function NotNowPage() {
  return (
    <LifeOsAuthGate
      area="NOT NOW"
      title="Sign in before Life OS can read your private parking lot."
      description="NOT NOW is a deliberate pause, not a project backlog. Every item remains owner-scoped under PostgreSQL RLS and cannot change Direction, Journey, Calendar, Today, or Memory."
    >
      <LiveNotNow />
    </LifeOsAuthGate>
  );
}
