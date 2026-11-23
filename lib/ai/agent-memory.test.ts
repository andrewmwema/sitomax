import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { closeOpenToolCalls, MEMORY_LIMITS, summarizeHistory, trimToolResults } from "./agent-memory";

type Message = Anthropic.MessageParam;
const call = (id: string, name: string, input: unknown = {}): Message =>
  ({ role: "assistant", content: [{ type: "tool_use", id, name, input }] });
const result = (id: string, content: string): Message =>
  ({ role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] });
const resultsOf = (messages: Message[]) => messages.flatMap((message) => typeof message.content === "string" ? []
  : message.content.flatMap((block) => block.type === "tool_result" ? [block] : []));

describe("AI agent thread memory", () => {
  it("answers tool calls a stopped run left open, and drops empty turns", () => {
    const repaired = closeOpenToolCalls([
      { role: "user", content: "Improve the home page" },
      call("a", "get_page"), result("a", "page"),
      call("b", "update_theme"), { role: "user", content: [] },
      { role: "user", content: "Try again" },
    ]);
    expect(repaired.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant", "user", "user"]);
    expect(resultsOf(repaired).map((block) => [block.tool_use_id, block.is_error ?? false])).toEqual([["a", false], ["b", true]]);
    expect(repaired.at(-1)).toEqual({ role: "user", content: "Try again" });
  });

  it("keeps only the latest tool results in full while a run is working", () => {
    const long = "x".repeat(MEMORY_LIMITS.toolResultChars + 1);
    const messages = Array.from({ length: 5 }, (_, index) => [call(`t${index}`, "get_page"), result(`t${index}`, index === 1 ? "short" : long)]).flat();
    const trimmed = trimToolResults(messages, 2);
    expect(resultsOf(trimmed).map((block) => block.content === long ? "full" : block.content === "short" ? "short" : "removed"))
      .toEqual(["removed", "short", "removed", "full", "full"]);
    expect(resultsOf(messages).filter((block) => block.content === long)).toHaveLength(4);
    expect(trimToolResults(trimmed, 2)).toEqual(trimmed);
  });

  it("leaves a short history untouched and summarises a long one without tool payloads", () => {
    const short: Message[] = [{ role: "user", content: "Hello" }, { role: "assistant", content: [{ type: "text", text: "Hi" }] }];
    expect(summarizeHistory(short)).toEqual(short);

    const page = "PAGE-PAYLOAD ".repeat(3_000);
    const history: Message[] = [
      { role: "user", content: "Never use blue. Make the home page warmer." },
      call("a", "get_page"), result("a", page),
      call("b", "plan", { steps: ["Warm palette", "Rewrite hero"] }), result("b", "The user approved the plan. Proceed."),
      call("c", "update_theme"), result("c", page),
      call("d", "update_section_props"), result("d", page),
      call("e", "update_section_props"), result("e", page),
      { role: "assistant", content: [{ type: "text", text: "I warmed the palette and rewrote the hero." }] },
    ];
    const [summary, ...rest] = summarizeHistory(history, { staged: ["Update site theme", "Update Hero section"] });
    expect(rest).toEqual([]);
    const text = summary.content as string;
    expect(text).toContain("User: Never use blue. Make the home page warmer.");
    expect(text).toContain("Warm palette");
    expect(text).toContain("User: The user approved the plan. Proceed.");
    expect(text).toContain("Agent steps: update_theme, update_section_props ×2");
    expect(text).toContain("Agent: I warmed the palette and rewrote the hero.");
    expect(text).toContain("Update site theme; Update Hero section");
    expect(text).not.toContain("PAGE-PAYLOAD");
    expect(text.length).toBeLessThan(MEMORY_LIMITS.summaryChars + 3_000);

    // A later summary carries the earlier one forward instead of nesting it.
    const again = summarizeHistory([summary, { role: "user", content: "Now the About page" }, call("f", "get_page"), result("f", page),
      { role: "assistant", content: [{ type: "text", text: "Done." }] }])[0].content as string;
    expect(again.match(/EARLIER IN THIS CONVERSATION/g)).toHaveLength(1);
    expect(again).toContain("User: Never use blue.");
    expect(again).toContain("User: Now the About page");
  });
});
