import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { planNudge } from "./agent-plan";
import {
  appendUserContent, closeOpenToolCalls, compactToolResults, dropThinking, MEMORY_LIMITS, summarizeHistory, withTurnContext,
} from "./agent-memory";

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

  it("never returns the model's signed reasoning, which is bound to a conversation that keeps changing", () => {
    const thinking = { type: "thinking" as const, thinking: "Plan the edit", signature: "signed" };
    const use = { type: "tool_use" as const, id: "a", name: "get_page", input: {} };
    const messages: Message[] = [
      { role: "user", content: "Improve the home page" },
      { role: "assistant", content: [thinking, use] }, result("a", "page"),
      { role: "assistant", content: [{ type: "redacted_thinking", data: "opaque" }] },
      { role: "assistant", content: [{ type: "text", text: "Done." }] },
    ];
    const cleaned = dropThinking(messages);
    expect(cleaned).toEqual([messages[0], { role: "assistant", content: [use] }, messages[2], messages[4]]);
    expect(cleaned[4 - 1]).toBe(messages[4]);
    expect(messages[1].content).toHaveLength(2);
  });

  it("leaves a run's conversation exactly as it was sent until it is long, then shortens it in one go", () => {
    const page = "x".repeat(20_000);
    const read = (index: number) => [call(`p${index}`, "get_page"), result(`p${index}`, page)];
    const edit = (index: number) => [call(`e${index}`, "update_section_props"), result(`e${index}`, "staged")];
    const kinds = (messages: Message[]) => resultsOf(messages).map((block) => block.content === page ? "page" : block.content === "staged" ? "staged" : "removed");
    const short = [...read(1), ...edit(1), ...read(2)];
    // Rewriting an earlier message would discard the provider's cached copy of everything after it.
    expect(compactToolResults(short).messages).toBe(short);

    const long = [...short, ...edit(2), ...read(3), ...Array.from({ length: 6 }, (_, index) => edit(index + 3)).flat()];
    const { messages: compacted, compactedChars } = compactToolResults(long);
    // The page being worked on stays in full however many steps ago it was read; finished pages go, short results stay.
    expect(kinds(compacted)).toEqual(["removed", "staged", "removed", "staged", "page", ...Array.from({ length: 6 }, () => "staged")]);
    expect(compactedChars).toBe(JSON.stringify(compacted).length);
    expect(compactToolResults(compacted, compactedChars).messages).toBe(compacted);
    expect(kinds(long).filter((kind) => kind === "page")).toHaveLength(3);

    // No more goes than is needed to halve it, starting with the oldest.
    const designs = "d".repeat(25_000);
    const mixed = [call("a", "list_section_designs"), result("a", designs), call("b", "search_site"), result("b", designs), ...read(1), ...edit(1)];
    expect(resultsOf(compactToolResults(mixed).messages).map((block) => block.content === designs ? "designs" : block.content === page ? "page" : block.content === "staged" ? "staged" : "removed"))
      .toEqual(["removed", "removed", "page", "staged"]);

    // What must stay can itself be long. The next shortening waits for real growth instead of rewriting history on every call.
    const post = "y".repeat(MEMORY_LIMITS.contextChars);
    const label = (messages: Message[]) => resultsOf(messages).map((block) =>
      block.content === page ? "page" : block.content === post ? "post" : block.content === "staged" ? "staged" : "removed");
    const heavy = compactToolResults([...read(1), call("b", "get_post"), result("b", post)]);
    expect(label(heavy.messages)).toEqual(["page", "post"]);
    const next = [...heavy.messages, ...edit(1), ...edit(2)];
    expect(compactToolResults(next, heavy.compactedChars).messages).toBe(next);
    const grown = [...next, call("c", "get_post"), result("c", post)];
    expect(label(compactToolResults(grown, heavy.compactedChars).messages)).toEqual(["page", "removed", "staged", "staged", "post"]);
  });

  it("marks the saved conversation as cacheable and adds the per-call context after it, without saving it", () => {
    const messages: Message[] = [{ role: "user", content: "Improve the home page" }, call("a", "get_page"), result("a", "page")];
    const sent = withTurnContext(messages, "OVERVIEW 1");
    expect(sent).toEqual([
      { role: "user", content: [{ type: "text", text: "Improve the home page" }] }, messages[1],
      { role: "user", content: [
        { type: "tool_result", tool_use_id: "a", content: "page", cache_control: { type: "ephemeral", ttl: "5m" } },
        { type: "text", text: "OVERVIEW 1" },
      ] },
    ]);
    expect(JSON.stringify(messages)).not.toContain("OVERVIEW");
    // The first message is sent in the same form on every call.
    expect(withTurnContext([messages[0]], "OVERVIEW 0")[0].content).toEqual([
      { type: "text", text: "Improve the home page", cache_control: { type: "ephemeral", ttl: "5m" } }, { type: "text", text: "OVERVIEW 0" },
    ]);

    // Text for the model joins the tool results it follows, so the user's turn is never doubled.
    const nudged = appendUserContent(messages, [{ type: "text", text: "Carry on." }]);
    expect(nudged).toHaveLength(3);
    expect(nudged[2].content).toEqual([{ type: "tool_result", tool_use_id: "a", content: "page" }, { type: "text", text: "Carry on." }]);
    expect(appendUserContent([messages[0], messages[1]], [{ type: "text", text: "Continue." }]).at(-1)).toEqual({ role: "user", content: [{ type: "text", text: "Continue." }] });
  });

  it("leaves a short history untouched and summarises a long one without tool payloads", () => {
    const short: Message[] = [{ role: "user", content: "Hello" }, { role: "assistant", content: [{ type: "text", text: "Hi" }] }];
    expect(summarizeHistory(short)).toEqual(short);

    const page = "PAGE-PAYLOAD ".repeat(3_000);
    const history: Message[] = [
      { role: "user", content: "Never use blue. Make the home page warmer." },
      call("a", "get_page"), result("a", page),
      call("b", "plan", { steps: ["Warm palette", "Rewrite hero"] }), result("b", "The user approved the plan. Proceed."),
      { role: "user", content: planNudge({ steps: [{ text: "Warm palette", status: "pending" }] }) },
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
    // What the app told the model along the way is not remembered as something the user said.
    expect(text).not.toContain("You stopped");
    expect(text.length).toBeLessThan(MEMORY_LIMITS.summaryChars + 3_000);

    // A later summary carries the earlier one forward instead of nesting it.
    const again = summarizeHistory([summary, { role: "user", content: "Now the About page" }, call("f", "get_page"), result("f", page),
      { role: "assistant", content: [{ type: "text", text: "Done." }] }])[0].content as string;
    expect(again.match(/EARLIER IN THIS CONVERSATION/g)).toHaveLength(1);
    expect(again).toContain("User: Never use blue.");
    expect(again).toContain("User: Now the About page");
  });
});
