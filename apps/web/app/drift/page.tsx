import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LiveDrift } from "../../components/live-drift";

export default function DriftPage() {
  return (
    <LifeOsAuthGate
      area="Drift + Return"
      title="Sign in before Life OS can read or record your private Drift history."
      description="Drift begins only when you say it does. The private API verifies your session and PostgreSQL RLS keeps every source note, understanding, and return decision inside your user scope."
    >
      <LiveDrift />
    </LifeOsAuthGate>
  );
}
