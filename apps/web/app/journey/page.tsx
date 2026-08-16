import { RealDataOnlySurface } from "../../components/real-data-only-surface";

export default function JourneyPage() {
  return (
    <RealDataOnlySurface
      area="Journey"
      title="Journey will appear only when it is real."
      description="This area is not backed by a canonical Journey read model yet, so Life OS will not fill it with sample goals, progress, or history."
    />
  );
}
