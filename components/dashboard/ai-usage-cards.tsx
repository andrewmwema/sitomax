import { unstable_rethrow } from "next/navigation";
import { getAiUsageSummaries, type AiUsageSummary } from "@/lib/ai/reporting";
import { AiUsageCard } from "./ai-usage-card";

export async function AiUsageCards() {
  let summaries: AiUsageSummary[];
  try {
    summaries = await getAiUsageSummaries();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Could not load dashboard AI usage");
    return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      AI usage is unavailable. Ask your agency to apply the AI usage migration or retry.
    </p>;
  }
  if (!summaries.length) return null;
  return <div id="ai-usage" className="grid gap-4">
    {summaries.map((usage) => <AiUsageCard key={usage.account_id} usage={usage} />)}
  </div>;
}
