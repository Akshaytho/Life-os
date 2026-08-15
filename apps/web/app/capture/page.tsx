import { CaptureRouting } from "../../components/capture-routing";
import { LiveCaptureRouting } from "../../components/live-capture-routing";
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

function liveBrowserCaptureConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_LIFE_OS_API_BASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

export default async function CapturePage({ searchParams }: { searchParams: Promise<{ sample?: string }> }) {
  if (liveBrowserCaptureConfigured()) return <LiveCaptureRouting />;

  const params = await searchParams;
  const initialInput = params.sample ? sampleMap[params.sample.toLowerCase()] ?? captureExamples[0] : captureExamples[0];
  return <CaptureRouting initialInput={initialInput} />;
}
