import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { fixtureChangeset, fixtureIds } from "@/test/fixtures/agent-site";
import {
  AGENT_LIMITS, newAgentState, reviewChangesetQuality, runAgentLoop, startAgentSegment,
  type AgentEvent, type AgentModel, type AgentState, type AgentToolContext,
} from "./agent";
import { createAgentReviewPayload, previewAgentReview } from "./agent-review";

type Params = Parameters<AgentModel>[0];
type Reply = { text?: string; tool?: [string, unknown]; tokens?: number };

const reservation = "00000000-0000-4000-8000-0000000000aa";
const context = { accountId: fixtureIds.account, siteId: fixtureIds.site } as AgentToolContext;
const edit = (heading: string): Reply => ({ tool: ["update_section_props", { pageId: fixtureIds.home, sectionId: "home-hero", props: { heading } }] });

/** A model that follows a script; `reply` sees each request, so tests can check what the model is sent. */
function scripted(reply: (params: Params, call: number) => Reply): AgentModel & { calls: Params[] } {
  const calls: Params[] = [];
  const model: AgentModel = async (params, { onText }) => {
    calls.push(structuredClone(params));
    const { text, tool, tokens = 100 } = reply(params, calls.length);
    if (text) onText(text);
    return {
      id: `msg-${calls.length}`, type: "message", role: "assistant", model: params.model, stop_sequence: null,
      stop_reason: tool ? "tool_use" : "end_turn",
      content: [
        ...(text ? [{ type: "text", text, citations: null }] : []),
        ...(tool ? [{ type: "tool_use", id: `call-${calls.length}`, name: tool[0], input: tool[1] }] : []),
      ],
      usage: { input_tokens: tokens, output_tokens: 10 },
    } as unknown as Anthropic.Message;
  };
  return Object.assign(model, { calls });
}
function start(model: AgentModel, state: AgentState = newAgentState([{ role: "user", content: "Improve the site" }], reservation), changeset = fixtureChangeset()) {
  const events: AgentEvent[] = [];
  const run = () => runAgentLoop({ model, changeset, state, context, emit: (event) => events.push(event), threadId: "thread", runId: "run" });
  return { state, changeset, events, run };
}
/** The provider rejects a conversation unless every tool call is followed by its result. */
function expectAnswered(messages: Anthropic.MessageParam[]) {
  messages.forEach((message, index) => {
    if (message.role !== "assistant" || typeof message.content === "string") return;
    const calls = message.content.flatMap((block) => block.type === "tool_use" ? [block.id] : []);
    const next = messages[index + 1];
    const results = next && typeof next.content !== "string"
      ? next.content.flatMap((block) => block.type === "tool_result" ? [block.tool_use_id] : []) : [];
    expect(results).toEqual(calls);
  });
}
const heading = (changeset: ReturnType<typeof fixtureChangeset>) =>
  ((changeset.working.pages[0].draft_data as { content: { props: Record<string, unknown> }[] }).content[0].props.heading);

describe("AI agent run loop", () => {
  it("pauses at the step limit with the changeset saved, and resumes where it stopped", async () => {
    const model = scripted((_params, call) => call <= AGENT_LIMITS.toolCalls + 1
      ? (call === 3 ? edit("Reliable plumbers") : { tool: ["get_site_overview", {}] }) : { text: "All done." });
    const { state, changeset, events, run } = start(model, newAgentState([{ role: "user", content: "Improve the site" }], reservation, true));

    expect(await run()).toBe("paused");
    expect(state.toolCalls).toBe(AGENT_LIMITS.toolCalls);
    expect(model.calls).toHaveLength(AGENT_LIMITS.toolCalls + 1);
    expect(state.messages.at(-1)).toMatchObject({ role: "user", content: [{ is_error: true, content: expect.stringContaining("Run limit reached") }] });
    expect(heading(changeset)).toBe("Reliable plumbers");
    expectAnswered(state.messages);

    startAgentSegment(state);
    expect(await run()).toBe("completed");
    expect(state.toolCalls).toBe(0);
    expect(state.runChanges).toBe(1);
    expect(state.tokenUsage.inputTokens).toBe(100 * (AGENT_LIMITS.toolCalls + 2));
    expect(events.at(-1)).toMatchObject({ type: "text", text: "All done." });
    expect(heading(changeset)).toBe("Reliable plumbers");
    expectAnswered(state.messages);
  });

  it("pauses when the token budget is spent and keeps only recent tool results in the context", async () => {
    const model = scripted(() => ({ tool: ["get_page", { pageId: fixtureIds.home }], tokens: 30_000 }));
    const { state, run } = start(model);
    expect(await run()).toBe("paused");
    expect(model.calls).toHaveLength(Math.ceil(AGENT_LIMITS.tokens / 30_010));
    const sent = model.calls.at(-1)!.messages.flatMap((message) => typeof message.content === "string" ? []
      : message.content.flatMap((block) => block.type === "tool_result" ? [String(block.content)] : []));
    expect(sent.filter((content) => content.includes("removed to save context"))).toHaveLength(sent.length - 6);
    expect(sent.at(-1)).toContain("home-hero");
    expectAnswered(state.messages);
  });

  it("asks before an eleventh change in one run, counting only that run's changes", async () => {
    const model = scripted((_params, call) => edit(`Heading ${call}`));
    const earlier = fixtureChangeset();
    earlier.changes = Array.from({ length: 12 }, (_, index) => ({ id: `earlier-${index}`, kind: "section_props", label: "Earlier", before: null, after: null, patches: [] }));
    const { state, changeset, events, run } = start(model, undefined, earlier);

    expect(await run()).toBe("awaiting_approval");
    expect(state.runChanges).toBe(AGENT_LIMITS.largeRunChanges);
    expect(changeset.changes).toHaveLength(12 + AGENT_LIMITS.largeRunChanges);
    expect(heading(changeset)).toBe("Heading 10");
    expect(state.awaiting).toMatchObject({ kind: "credit", toolName: "update_section_props", payload: { input: { props: { heading: "Heading 11" } } } });
    expect(events.at(-1)).toMatchObject({ type: "credit_confirmation", credits: 3 });
    // The unanswered call is the last message; the approval answers it before the run continues.
    expect(state.messages.at(-1)!.role).toBe("assistant");
  });

  it("waits for the user on a plan or a question, and gives the model one chance to repair bad input", async () => {
    const plan = start(scripted(() => ({ tool: ["plan", { steps: ["Rewrite the hero", "Add an FAQ"] }] })));
    expect(await plan.run()).toBe("awaiting_approval");
    expect(plan.state.awaiting).toMatchObject({ kind: "plan", payload: { steps: ["Rewrite the hero", "Add an FAQ"] } });
    expect(plan.events.at(-1)).toMatchObject({ type: "plan", steps: ["Rewrite the hero", "Add an FAQ"] });

    const question = start(scripted(() => ({ tool: ["ask_user", { question: "Which tone?", options: ["Formal", "Friendly"] }] })));
    expect(await question.run()).toBe("awaiting_input");
    expect(question.events.at(-1)).toMatchObject({ type: "question", options: ["Formal", "Friendly"] });

    const invalid = scripted(() => ({ tool: ["update_section_props", { pageId: fixtureIds.home, sectionId: "home-hero", props: { variant: "nope" } }] }));
    const repair = start(invalid);
    expect(await repair.run()).toBe("paused");
    expect(invalid.calls).toHaveLength(2);
    const errors = repair.events.filter((event) => event.type === "tool_error").map((event) => String(event.message));
    expect(errors[0]).toMatch(/^Invalid tool input: variant: .*Repair the input and retry once\.$/);
    expect(errors[1]).toContain("still invalid after one repair attempt");
    expect(repair.changeset.changes).toHaveLength(0);
    expect(repair.changeset.working).toEqual(repair.changeset.baseline);
  });

  it("stops without calling the model once the user has pressed Stop", async () => {
    const model = scripted(() => ({ text: "unused" }));
    const stopped = new AbortController();
    stopped.abort();
    const state = newAgentState([{ role: "user", content: "Improve the site" }], reservation);
    expect(await runAgentLoop({ model, changeset: fixtureChangeset(), state, context, emit: () => {}, signal: stopped.signal, threadId: "t", runId: "r" })).toBe("stopped");
    expect(model.calls).toHaveLength(0);
  });

  it("stages quality repairs as reviewable changes and reports what is left", async () => {
    const model = scripted((_params, call) => [
      { tool: ["update_theme", { patch: { colors: { background: "#0b1020", text: "#f8fafc" } } }] },
      { tool: ["update_section_design", { pageId: fixtureIds.home, sectionId: "home-why-0", design: { appearance: { desktop: { textColor: "#f8fafc" } } } }] },
      { tool: ["update_theme", { patch: { colors: { background: "#ffffff", text: "#17202b" } } }] },
      { tool: ["update_section_props", { pageId: fixtureIds.home, sectionId: "home-why-2", props: { href: "/offers", label: "Offers for [season]" } }] },
      { text: "Done." },
    ][call - 1] as Reply);
    const { changeset, run } = start(model);
    expect(await run()).toBe("completed");

    const report = reviewChangesetQuality(changeset);
    expect(report.fixed).toEqual(["Home: adjusted 1 text colour to stay readable."]);
    expect(report.notes).toEqual([
      "Home › Button: the button “Offers for [season]” links to /offers, which is not a page on this site.",
      "Home: 1 placeholder to fill in before publishing: [season].",
    ]);
    expect(changeset.changes.at(-1)).toMatchObject({ kind: "quality_fix", pageId: fixtureIds.home, label: "Quality fix: adjusted 1 text colour to stay readable." });
    const review = createAgentReviewPayload(changeset)!;
    expect(review.quality).toEqual(report);
    expect(previewAgentReview(review, {}).snapshot).toEqual(review.working);
    // Checking again finds nothing new to repair.
    expect(reviewChangesetQuality(changeset).fixed).toEqual([]);
    expect(changeset.changes.filter((change) => change.kind === "quality_fix")).toHaveLength(1);
  });
});
