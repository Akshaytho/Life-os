import { JourneyDashboard } from "../../../../components/journey-dashboard";
import { journeySample } from "../../../../lib/journey-sample-data";

export default function SoundDesignJourneyPage() {
  return <JourneyDashboard model={journeySample} />;
}
