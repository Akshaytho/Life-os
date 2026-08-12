import { CaptureRouting } from "../../components/capture-routing";
import { captureExamples } from "../../lib/routing-sample";

const sampleMap: Record<string, string> = {
  tentative: captureExamples[0],
  travel: captureExamples[1],
  confirmed: captureExamples[2],
  learning: captureExamples[3],
  direction: captureExamples[4],
  health: captureExamples[5],
  drift: captureExamples[6],
};

export default async function CapturePage({ searchParams }: { searchParams: Promise<{ sample?: string }> }) {
  const params = await searchParams;
  const initialInput = params.sample ? sampleMap[params.sample.toLowerCase()] ?? captureExamples[0] : captureExamples[0];
  return <CaptureRouting initialInput={initialInput} />;
}
