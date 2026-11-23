import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { addCallCost, cacheSummary, emptyAgentCost, promptParts, SITE_OVERVIEW_MARK, splitCallCost } from "./agent-cost";
import { SITE_GENERATION_MODEL, SMALL_EDIT_MODEL } from "./models";
import { calculateCostUsd } from "./pricing";

const params = {
  system: "s".repeat(1000),
  tools: [{ name: "get_page", description: "t".repeat(1958), input_schema: { type: "object" as const } }],
  messages: [
    { role: "user", content: [{ type: "text", text: "h".repeat(500) }] },
    { role: "assistant", content: [{ type: "tool_use", id: "a", name: "get_page", input: {} }, { type: "tool_use", id: "b", name: "update_theme", input: {} }] },
    { role: "user", content: [
      { type: "tool_result", tool_use_id: "a", content: "p".repeat(3000) },
      { type: "tool_result", tool_use_id: "b", content: "r".repeat(400) },
      { type: "text", text: `${SITE_OVERVIEW_MARK}${"o".repeat(1000 - SITE_OVERVIEW_MARK.length)}` },
    ] },
  ] satisfies Anthropic.MessageParam[],
};
const usage = { inputTokens: 300, outputTokens: 200, cacheReadTokens: 1000, cacheWrite5mTokens: 500, cacheWrite1hTokens: 200 };

describe("AI agent cost breakdown", () => {
  it("names each part of a prompt in the order the provider reads it", () => {
    const parts = promptParts(params);
    expect(parts.map(({ part }) => part)).toEqual(["toolDefinitions", "systemPrompt", "history", "history", "history", "pageReads", "toolResults", "siteOverview"]);
    expect(parts.find(({ part }) => part === "pageReads")?.chars).toBe(3000);
  });

  it("divides a request's exact cost over its parts, cached prefix first", () => {
    const parts = splitCallCost(SITE_GENERATION_MODEL, params, usage);
    const total = Object.values(parts).reduce((sum, part) => sum + part.costUsd, 0);
    expect(total).toBeCloseTo(calculateCostUsd(SITE_GENERATION_MODEL, usage), 10);
    expect(Object.values(parts).reduce((sum, part) => sum + part.tokens, 0)).toBeCloseTo(2200, 6);
    // Tools and the system prompt lead the prompt, so they are what was read from the cache.
    expect(parts.toolDefinitions.costUsd / parts.toolDefinitions.tokens).toBeCloseTo(0.1 / 1_000_000, 12);
    // The overview closes the prompt, after the last cache breakpoint, so it is paid in full.
    expect(parts.siteOverview.costUsd / parts.siteOverview.tokens).toBeCloseTo(2 / 1_000_000, 12);
    expect(parts.output).toEqual({ tokens: 200, costUsd: 0.002 });
  });

  it("adds up a run request by request, each at its own model's prices", () => {
    const small = { inputTokens: 2000, outputTokens: 100, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 };
    const cost = addCallCost(addCallCost(emptyAgentCost(), SITE_GENERATION_MODEL, params, usage), SMALL_EDIT_MODEL, params, small);
    expect(cost.calls).toBe(2);
    expect(cost.costUsd).toBeCloseTo(calculateCostUsd(SITE_GENERATION_MODEL, usage) + calculateCostUsd(SMALL_EDIT_MODEL, small), 10);
    expect(cost.models[SMALL_EDIT_MODEL]).toMatchObject({ calls: 1, costUsd: 0.00025 });
    expect(Object.values(cost.parts).reduce((sum, part) => sum + part.costUsd, 0)).toBeCloseTo(cost.costUsd, 10);
    expect(cacheSummary(cost)).toEqual({ readTokens: 1000, write5mTokens: 500, write1hTokens: 200, uncachedTokens: 2300, hitRate: 0.25 });
  });
});
