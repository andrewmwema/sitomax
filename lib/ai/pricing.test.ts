import { describe, expect, it } from "vitest";
import { SITE_GENERATION_MODEL, SMALL_EDIT_MODEL } from "./models";
import { calculateCostUsd, type TokenUsage } from "./pricing";

const tokens = (overrides: Partial<TokenUsage>): TokenUsage => ({
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
  cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, ...overrides,
});
describe("configured AI token billing", () => {
  it("prices input, output, cache reads and both cache-write TTLs independently", () => {
    expect(calculateCostUsd(SITE_GENERATION_MODEL, tokens({
      inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000,
      cacheWrite5mTokens: 1_000_000, cacheWrite1hTokens: 1_000_000,
    }))).toBe(18.6);
  });
  it("switches the entire Haiku request to long-context rates strictly above 100K", () => {
    expect(calculateCostUsd(SMALL_EDIT_MODEL, tokens({ inputTokens: 100_000, outputTokens: 1000 }))).toBe(0.0105);
    expect(calculateCostUsd(SMALL_EDIT_MODEL, tokens({ inputTokens: 100_001, outputTokens: 1000 }))).toBe(0.0525005);
    expect(calculateCostUsd(SMALL_EDIT_MODEL, tokens({ inputTokens: 1, outputTokens: 1 }))).toBe(0.0000006);
  });
  it("prices Haiku's cache reads and writes at its published prices, in both prompt-length tiers", () => {
    expect(calculateCostUsd(SMALL_EDIT_MODEL, tokens({ cacheReadTokens: 50_000, cacheWrite5mTokens: 20_000, cacheWrite1hTokens: 30_000 })))
      .toBe(0.009);
    // Cache reads and writes count towards the prompt length that decides the tier.
    expect(calculateCostUsd(SMALL_EDIT_MODEL, tokens({ inputTokens: 1, cacheReadTokens: 50_000, cacheWrite5mTokens: 20_000, cacheWrite1hTokens: 30_000 })))
      .toBe(0.0450005);
    // A cache hit costs a tenth of fresh input; an hour's write costs twice it.
    expect(calculateCostUsd(SMALL_EDIT_MODEL, tokens({ cacheReadTokens: 100_000 }))).toBe(0.001);
    expect(calculateCostUsd(SMALL_EDIT_MODEL, tokens({ cacheWrite1hTokens: 100_000 }))).toBe(0.02);
  });
  it("fails closed for unknown models and invalid token counts", () => {
    expect(() => calculateCostUsd("unknown", tokens({}))).toThrow("pricing");
    expect(() => calculateCostUsd("toString", tokens({}))).toThrow("pricing");
    expect(() => calculateCostUsd(SITE_GENERATION_MODEL, tokens({ inputTokens: -1 }))).toThrow();
    expect(() => calculateCostUsd(SITE_GENERATION_MODEL, tokens({ outputTokens: NaN }))).toThrow();
  });
});
