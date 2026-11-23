import { z } from "zod";
import { formatAiCost } from "./cost-format";
import { tokenUsageSchema } from "./pricing";
import { agentCostSchema } from "./agent-cost";

/**
 * What one agent run cost. Clients see credits; token counts and the provider
 * cost are only present for the agency.
 */
export const agentRunUsageSchema = z.object({
  /** included: counted against the monthly allowance. none: nothing was charged. */
  charge: z.enum(["included", "credits", "unlimited", "none"]),
  credits: z.number().int().min(0).max(3),
  tokens: tokenUsageSchema.optional(),
  costUsd: z.number().nonnegative().optional(),
  /** Where the tokens and money went, by part of the prompt and by model. */
  breakdown: agentCostSchema.optional(),
});
export type AgentRunUsage = z.infer<typeof agentRunUsageSchema>;

export function describeAgentUsage(usage: AgentRunUsage): string {
  const charge = usage.charge === "credits" ? `${usage.credits} ${usage.credits === 1 ? "credit" : "credits"}`
    : usage.charge === "included" ? "Included in your monthly AI allowance"
      : usage.charge === "unlimited" ? "No credits charged (agency)" : "Not charged";
  if (!usage.tokens) return charge;
  const { inputTokens, outputTokens, cacheReadTokens, cacheWrite5mTokens, cacheWrite1hTokens } = usage.tokens;
  const cached = cacheReadTokens + cacheWrite5mTokens + cacheWrite1hTokens;
  const number = (value: number) => value.toLocaleString("en-US");
  return `${charge} · ${number(inputTokens)} input, ${number(outputTokens)} output${cached ? `, ${number(cached)} cached` : ""} tokens`
    + (usage.costUsd === undefined ? "" : ` · ${formatAiCost(usage.costUsd, true)}`);
}
