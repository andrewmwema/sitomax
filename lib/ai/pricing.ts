import { z } from "zod";
import { SITE_GENERATION_MODEL, SMALL_EDIT_MODEL } from "./models";

export type Rates = {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
};

/** Agency-supplied USD per million tokens, not automatically fetched provider prices. */
export const AI_PRICING: Record<string, { standard: Rates; longContext?: { above: number; rates: Rates } }> = {
  [SITE_GENERATION_MODEL]: {
    standard: { input: 2, output: 10, cacheRead: 0.1, cacheWrite5m: 2.5, cacheWrite1h: 4 },
  },
  [SMALL_EDIT_MODEL]: {
    standard: { input: 0.1, output: 0.5 },
    longContext: { above: 100_000, rates: { input: 0.5, output: 2.5 } },
  },
};

const tokens = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const tokenUsageSchema = z.object({
  inputTokens: tokens,
  outputTokens: tokens,
  cacheReadTokens: tokens.default(0),
  cacheWrite5mTokens: tokens.default(0),
  cacheWrite1hTokens: tokens.default(0),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export function assertPricedModel(model: string) {
  if (!Object.hasOwn(AI_PRICING, model)) throw new Error(`No AI pricing configured for model: ${model}`);
}

/** The prices one request is billed at. Haiku's long-context prices apply to the whole request. */
export function ratesFor(model: string, usage: TokenUsage): Rates {
  assertPricedModel(model);
  const config = AI_PRICING[model];
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWrite5mTokens + usage.cacheWrite1hTokens;
  return config.longContext && promptTokens > config.longContext.above ? config.longContext.rates : config.standard;
}

/** The cost of one request. A run of several requests is the sum of each, never the cost of their summed tokens. */
export function calculateCostUsd(model: string, raw: TokenUsage): number {
  const usage = tokenUsageSchema.parse(raw);
  const rates = ratesFor(model, usage);
  const terms: [number, number | undefined, string][] = [
    [usage.inputTokens, rates.input, "input"],
    [usage.outputTokens, rates.output, "output"],
    [usage.cacheReadTokens, rates.cacheRead, "cache read"],
    [usage.cacheWrite5mTokens, rates.cacheWrite5m, "5-minute cache write"],
    [usage.cacheWrite1hTokens, rates.cacheWrite1h, "1-hour cache write"],
  ];
  let cost = 0;
  for (const [count, rate, label] of terms) {
    if (count === 0) continue;
    if (rate === undefined || !Number.isFinite(rate) || rate < 0) throw new Error(`No valid ${label} price configured for ${model}`);
    cost += count * rate;
  }
  // Preserve sub-cent requests; never round each request to currency display precision.
  return Number((cost / 1_000_000).toFixed(12));
}
