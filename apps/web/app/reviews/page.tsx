import { LifeOsAuthGate } from "../../components/life-os-auth-gate";
import { LivePeriodicReviews } from "../../components/live-periodic-reviews";

export default function ReviewsPage() {
  return (
    <LifeOsAuthGate
      area="Weekly + Monthly Reviews"
      title="Sign in before Life OS can assemble your private period review."
      description="Reviews compress your RLS-scoped Calendar, Daily Return, Journey, Drift, and NOT NOW records without scoring you or changing their authority."
    >
      <LivePeriodicReviews />
    </LifeOsAuthGate>
  );
}
