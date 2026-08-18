import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LiveAiRetrieval } from "../../components/live-ai-retrieval";

export default function AskLifeOsPage() {
  return (
    <LifeOsAuthGate
      area="Ask Life OS"
      title="Sign in before AI can receive your private, source-bounded context."
      description="Ask Life OS is read-only. It retrieves a small RLS-scoped context package, labels every source, and cannot change your Direction, Journey, Calendar, Memory, or plans."
    >
      <LiveAiRetrieval />
    </LifeOsAuthGate>
  );
}
