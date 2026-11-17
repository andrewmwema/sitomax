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

export async function getMonthlyAiCosts(month: string) {
  const parsed = monthSchema.parse(month);
  const { supabase } = await requireSuperAdmin();
  const rowSchema = z.object({
    account_id: z.uuid(), account_name: z.string(), requests: count,
    cost_usd: z.coerce.number().finite().nonnegative(),
  });
  const rows: z.infer<typeof rowSchema>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.rpc("ai_monthly_costs", { p_month: `${parsed}-01` })
      .order("account_id").range(from, from + 999);
    if (error) throw new Error("Could not load monthly AI costs.", { cause: error });
    const page = z.array(rowSchema).parse(data);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
