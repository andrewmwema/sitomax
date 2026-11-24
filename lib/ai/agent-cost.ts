import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { formatAiCost } from "./cost-format";
import { calculateCostUsd, ratesFor, tokenUsageSchema, type TokenUsage } from "./pricing";

/**
 * Where an agent run's money goes. The provider reports tokens per request,
 * not per part of the prompt, so each request's prompt tokens are divided
 * over its parts by their size in characters. The parts are then priced in
 * the order the provider reads them (tools, system prompt, messages): what
 * was read from the cache first, what was written to it next, and what was
 * sent uncached last. Per part the figures are estimates; their total is the
 * exact cost of the run.
 */
export const COST_PARTS = ["systemPrompt", "toolDefinitions", "siteOverview", "pageReads", "toolResults", "history", "output"] as const;
export type CostPart = (typeof COST_PARTS)[number];
export const COST_PART_LABELS: Record<CostPart, string> = {
  systemPrompt: "System prompt", toolDefinitions: "Tool definitions", siteOverview: "Site overview", pageReads: "Page reads",
  toolResults: "Tool results", history: "Conversation", output: "Output",
};
/** Every site overview sent to the model starts with this, which is how it is told apart from the conversation. */
export const SITE_OVERVIEW_MARK = "SITE OVERVIEW";
const PAGE_READ_TOOLS = new Set(["get_page", "get_section", "get_post"]);
const OVERVIEW_TOOLS = new Set(["get_site_overview", "get_site_settings"]);

const amount = z.object({ tokens: z.number().nonnegative(), costUsd: z.number().nonnegative() });
export const agentCostSchema = z.object({
  /** Model requests made. */
  calls: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  parts: z.object({
    systemPrompt: amount, toolDefinitions: amount, siteOverview: amount, pageReads: amount, toolResults: amount, history: amount, output: amount,
  }),
  models: z.record(z.string(), z.object({ calls: z.number().int().nonnegative(), costUsd: z.number().nonnegative(), usage: tokenUsageSchema })),
});
export type AgentCost = z.infer<typeof agentCostSchema>;

const NO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 };
const usd = (value: number) => Number(value.toFixed(12));

export function emptyAgentCost(): AgentCost {
  return {
    calls: 0, costUsd: 0, models: {},
    parts: Object.fromEntries(COST_PARTS.map((part) => [part, { tokens: 0, costUsd: 0 }])) as AgentCost["parts"],
  };
}

export function messageUsage(message: Anthropic.Message): TokenUsage {
  const { usage } = message;
  return tokenUsageSchema.parse({
    inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWrite5mTokens: usage.cache_creation?.ephemeral_5m_input_tokens ?? 0,
    cacheWrite1hTokens: usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
  });
}
export function addUsage(total: TokenUsage, usage: TokenUsage): TokenUsage {
  return {
    inputTokens: total.inputTokens + usage.inputTokens, outputTokens: total.outputTokens + usage.outputTokens,
    cacheReadTokens: total.cacheReadTokens + usage.cacheReadTokens,
    cacheWrite5mTokens: total.cacheWrite5mTokens + usage.cacheWrite5mTokens,
    cacheWrite1hTokens: total.cacheWrite1hTokens + usage.cacheWrite1hTokens,
  };
}

type Params = Pick<Anthropic.MessageCreateParamsNonStreaming, "system" | "tools" | "messages">;
/** A request's prompt as the provider reads it, in order, with the size of each part. */
export function promptParts(params: Params): { part: Exclude<CostPart, "output">; chars: number }[] {
  const parts: { part: Exclude<CostPart, "output">; chars: number }[] = [];
  const add = (part: Exclude<CostPart, "output">, value: unknown) => {
    const chars = typeof value === "string" ? value.length : JSON.stringify(value ?? "").length;
    if (chars) parts.push({ part, chars });
  };
  if (params.tools?.length) add("toolDefinitions", params.tools);
  if (params.system) add("systemPrompt", typeof params.system === "string" ? params.system : params.system.map((block) => block.text).join(""));
  const toolNames = new Map<string, string>();
  for (const message of params.messages) {
    if (typeof message.content === "string") { add("history", message.content); continue; }
    for (const block of message.content) {
      if (block.type === "tool_use") toolNames.set(block.id, block.name);
      if (block.type === "text") add(block.text.startsWith(SITE_OVERVIEW_MARK) ? "siteOverview" : "history", block.text);
      else if (block.type === "tool_result") {
        const name = toolNames.get(block.tool_use_id) ?? "";
        add(PAGE_READ_TOOLS.has(name) ? "pageReads" : OVERVIEW_TOOLS.has(name) ? "siteOverview" : "toolResults", block.content);
      } else add("history", block);
    }
  }
  return parts;
}

/** One request's cost, divided over the parts of its prompt and its output. */
export function splitCallCost(model: string, params: Params, usage: TokenUsage): AgentCost["parts"] {
  const { parts } = emptyAgentCost();
  const rates = ratesFor(model, usage);
  const prompt = promptParts(params);
  const chars = prompt.reduce((total, { chars: size }) => total + size, 0);
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWrite5mTokens + usage.cacheWrite1hTokens;
  // The cached prefix comes first; one-hour entries are written before five-minute ones.
  const bands: [number, number][] = [
    [usage.cacheReadTokens, rates.cacheRead ?? 0], [usage.cacheWrite1hTokens, rates.cacheWrite1h ?? 0],
    [usage.cacheWrite5mTokens, rates.cacheWrite5m ?? 0], [usage.inputTokens, rates.input],
  ];
  let band = 0;
  for (const { part, chars: size } of prompt) {
    let tokens = chars ? promptTokens * size / chars : 0;
    parts[part].tokens += tokens;
    while (tokens > 0 && band < bands.length) {
      const used = Math.min(tokens, bands[band][0]);
      parts[part].costUsd += used * bands[band][1] / 1_000_000;
      bands[band][0] -= used;
      tokens -= used;
      if (bands[band][0] <= 1e-9) band++;
    }
  }
  parts.output = { tokens: usage.outputTokens, costUsd: usage.outputTokens * rates.output / 1_000_000 };
  return parts;
}

/** Adds one model request to a run's cost. */
export function addCallCost(cost: AgentCost, model: string, params: Params, usage: TokenUsage): AgentCost {
  const callCost = calculateCostUsd(model, usage);
  const split = splitCallCost(model, params, usage);
  const previous = cost.models[model] ?? { calls: 0, costUsd: 0, usage: NO_USAGE };
  return {
    calls: cost.calls + 1,
    costUsd: usd(cost.costUsd + callCost),
    parts: Object.fromEntries(COST_PARTS.map((part) => [part, {
      tokens: Number((cost.parts[part].tokens + split[part].tokens).toFixed(2)), costUsd: usd(cost.parts[part].costUsd + split[part].costUsd),
    }])) as AgentCost["parts"],
    models: { ...cost.models, [model]: { calls: previous.calls + 1, costUsd: usd(previous.costUsd + callCost), usage: addUsage(previous.usage, usage) } },
  };
}

/** How much of the prompt was read from the cache, written to it, or sent uncached. */
export function cacheSummary(cost: AgentCost) {
  const usage = Object.values(cost.models).reduce((total, model) => addUsage(total, model.usage), NO_USAGE);
  const prompt = usage.inputTokens + usage.cacheReadTokens + usage.cacheWrite5mTokens + usage.cacheWrite1hTokens;
  return {
    readTokens: usage.cacheReadTokens, write5mTokens: usage.cacheWrite5mTokens, write1hTokens: usage.cacheWrite1hTokens,
    uncachedTokens: usage.inputTokens, hitRate: prompt ? Number((usage.cacheReadTokens / prompt).toFixed(4)) : 0,
  };
}

const count = (value: number) => Math.round(value).toLocaleString("en-US");
/** The breakdown as lines of text, for the agency's cost details and the eval report. */
export function describeAgentCost(cost: AgentCost): string[] {
  const cache = cacheSummary(cost);
  return [
    ...COST_PARTS.filter((part) => cost.parts[part].tokens > 0).map((part) =>
      `${COST_PART_LABELS[part]}: ${count(cost.parts[part].tokens)} tokens · ${formatAiCost(cost.parts[part].costUsd, true)}`),
    `Cache: ${Math.round(cache.hitRate * 100)}% of input read from cache (${count(cache.readTokens)} read, `
      + `${count(cache.write5mTokens + cache.write1hTokens)} written, ${count(cache.uncachedTokens)} uncached)`,
    `Models: ${Object.entries(cost.models).map(([model, entry]) => `${model} × ${entry.calls} · ${formatAiCost(entry.costUsd, true)}`).join(", ")}`,
  ];
}

/** The same breakdown as plain numbers, for the server log. It holds no site content. */
export function agentCostLog(cost: AgentCost) {
  return {
    calls: cost.calls, costUsd: cost.costUsd, cache: cacheSummary(cost),
    parts: Object.fromEntries(COST_PARTS.map((part) => [part, { tokens: Math.round(cost.parts[part].tokens), costUsd: Number(cost.parts[part].costUsd.toFixed(6)) }])),
    models: Object.fromEntries(Object.entries(cost.models).map(([model, entry]) => [model, { calls: entry.calls, costUsd: Number(entry.costUsd.toFixed(6)) }])),
  };
}
