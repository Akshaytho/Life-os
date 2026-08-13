import { MemoryOverview } from "../../components/memory-overview";
import { memorySample } from "../../lib/memory-sample-data";

export default function MemoryPage() {
  return <MemoryOverview model={memorySample} />;
}
