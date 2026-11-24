import "server-only";

import { z } from "zod";
import { requireSuperAdmin, requireUser } from "@/lib/auth";

const count = z.number().int().nonnegative();
export const usageSummarySchema = z.object({
  account_id: z.uuid(), account_name: z.string(),
  site_generations: count, edits: count,
  included_generations: count, included_edits: count, pending_requests: count,
  monthly_site_generations: count, monthly_edits: count, extra_credits: count,
});
export type AiUsageSummary = z.infer<typeof usageSummarySchema>;

export async function getAiUsageSummaries(): Promise<AiUsageSummary[]> {
  const { supabase } = await requireUser();
  const rows: AiUsageSummary[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.rpc("ai_account_summaries")
      .order("account_id").range(from, from + 999);
    if (error) throw new Error("Could not load AI usage. Check that the AI migration is applied.", { cause: error });
    const page = z.array(usageSummarySchema).parse(data);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month in YYYY-MM format.")
  .refine((value) => Number(value.slice(0, 4)) >= 1, "Choose a valid year.");

const money = z.coerce.number().finite().nonnegative();
const monthlyCostSchema = z.object({
  account_id: z.uuid(), account_name: z.string(), requests: count,
  cost_usd: money, agency_cost_usd: money, credits_charged: count,
});
export type MonthlyAiCost = z.infer<typeof monthlyCostSchema>;
const reportSchema = z.object({
  clients: z.array(monthlyCostSchema),
  agency: z.array(z.object({
    action_type: z.enum(["site_generation", "agent_run", "edit", "lead_draft", "blog_ai"]),
    requests: count, tokens: count, cost_usd: money,
  })),
  daily: z.array(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), clients: money, agency: money, evals: money })),
  totals: z.object({ clients: money, agency: money, evals: money, requests: count }),
});
export type MonthlyAiReport = z.infer<typeof reportSchema>;

export async function getMonthlyAiCosts(month: string): Promise<MonthlyAiReport> {
  const parsed = monthSchema.parse(month);
  const { supabase } = await requireSuperAdmin();
  const { data, error } = await supabase.rpc("ai_cost_report", { p_month: `${parsed}-01` });
  if (error) throw new Error("Could not load monthly AI costs. Check that the AI reporting migration is applied.", { cause: error });
  return reportSchema.parse(data);
}
