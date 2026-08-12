import { JourneyOverview } from "../../components/journey-overview";
import { journeySample } from "../../lib/journey-sample-data";

export default function JourneyPage() {
  return <JourneyOverview model={journeySample} />;
}
