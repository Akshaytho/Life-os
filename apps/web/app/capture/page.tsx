import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LiveCaptureRouting } from "../../components/live-capture-routing";

export default function CapturePage() {
  return (
    <LifeOsAuthGate
      area="Brain Dump"
      title="Sign in before Life OS can read or save your private Brain Dump."
      description="Brain Dump uses your normal Supabase user session. The private API verifies it again and PostgreSQL RLS keeps every source, interpretation, classification, parking decision, and trace inside your user scope."
    >
      <LiveCaptureRouting />
    </LifeOsAuthGate>
  );
}
