import { InteractionLedgerDetail } from "../../../components/interaction-ledger-detail";
import { committedInteractionSample, rejectedInteractionSample } from "../../../lib/interaction-ledger-sample";

export default async function InteractionSamplePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const params = await searchParams;
  const rejected = params.state?.toLowerCase() === "rejected";

  return (
    <InteractionLedgerDetail
      trace={rejected ? rejectedInteractionSample : committedInteractionSample}
      sampleState={rejected ? "rejected" : "committed"}
    />
  );
}
