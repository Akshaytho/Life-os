import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LiveMemory } from "../../components/live-memory";

export default function MemoryPage() {
  return (
    <LifeOsAuthGate
      area="Memory"
      title="Sign in before Life OS can retrieve your private Memory."
      description="Memory reads only RLS-scoped current owners, explicit retained reflections, and review compression. It never treats recent text as automatic truth."
    >
      <LiveMemory />
    </LifeOsAuthGate>
  );
}
