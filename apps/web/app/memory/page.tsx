import { RealDataOnlySurface } from "../../components/real-data-only-surface";

export default function MemoryPage() {
  return (
    <RealDataOnlySurface
      area="Memory"
      title="Memory will show only trusted persisted context."
      description="This area is not backed by a canonical Memory read model yet, so Life OS will not present sample memories, invented context, or placeholder personal history."
    />
  );
}
