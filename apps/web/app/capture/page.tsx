import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LiveCaptureRouting } from "../../components/live-capture-routing";

export default function CapturePage() {
  return (
    <LifeOsAuthGate
      area="Capture"
      title="Sign in before Life OS can read or save private Capture."
      description="Capture uses a normal Supabase user session. The private API verifies it again and PostgreSQL RLS keeps every source, interpretation, proposal, decision, and trace inside your user scope."
    >
      <LiveCaptureRouting />
    </LifeOsAuthGate>
  );
}
