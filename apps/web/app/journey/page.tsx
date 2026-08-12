import { JourneyDashboard } from "../../components/journey-dashboard";
import { journeySample } from "../../lib/journey-sample-data";

export default function JourneyPage() {
  return <JourneyDashboard model={journeySample} />;
}
