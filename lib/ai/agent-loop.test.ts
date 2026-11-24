import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { fixtureChangeset, fixtureIds } from "@/test/fixtures/agent-site";
import {
  AGENT_LIMITS, answerAwaiting, newAgentState, reviewChangesetQuality, runAgentLoop, startAgentSegment,
  type AgentEvent, type AgentModel, type AgentState, type AgentToolContext,
} from "./agent";
import { newAgentPlan, unfinishedPlanSteps } from "./agent-plan";
import { SITE_GENERATION_MODEL, SMALL_EDIT_MODEL } from "./models";
import { agentTools, smallAgentTools } from "./agent-tools";
import { createAgentReviewPayload, previewAgentReview } from "./agent-review";

type Params = Parameters<AgentModel>[0];
type Reply = { text?: string; tool?: [string, unknown]; tokens?: number; stop?: "max_tokens" };

const reservation = "00000000-0000-4000-8000-0000000000aa";
const context = { accountId: fixtureIds.account, siteId: fixtureIds.site } as AgentToolContext;
const edit = (heading: string): Reply => ({ tool: ["update_section_props", { pageId: fixtureIds.home, sectionId: "home-hero", props: { heading } }] });

/** A model that follows a script; `reply` sees each request, so tests can check what the model is sent. */
function scripted(reply: (params: Params, call: number) => Reply): AgentModel & { calls: Params[] } {
  const calls: Params[] = [];
  const model: AgentModel = async (params, { onText }) => {
    calls.push(structuredClone(params));
    const { text, tool, tokens = 100, stop } = reply(params, calls.length);
    if (text) onText(text);
    return {
      id: `msg-${calls.length}`, type: "message", role: "assistant", model: params.model, stop_sequence: null,
      stop_reason: stop ?? (tool ? "tool_use" : "end_turn"),
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
  const escalations: string[] = [];
  const run = () => runAgentLoop({
    model, changeset, state, context, emit: (event) => events.push(event), threadId: "thread", runId: "run", onEscalate: (reason) => escalations.push(reason),
  });
  return { state, changeset, events, run, escalations };
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
/** What a call was sent, as the provider reads it: the site overview first, then the conversation, marked up to its end. */
function sent(params: Params) {
  const [first, ...rest] = params.messages;
  const [overview, ...opening] = first.content as Anthropic.TextBlockParam[];
  const unmarked = (message: Anthropic.MessageParam) => ({ role: message.role, content: (message.content as Anthropic.ContentBlockParam[]).map((block) => {
    const { cache_control: _breakpoint, ...plain } = block as Anthropic.TextBlockParam;
    void _breakpoint;
    return plain;
  }) });
  const last = (params.messages.at(-1)!.content as { cache_control?: unknown }[]).at(-1)!;
  return {
    overview: overview.text, overviewMark: overview.cache_control, cached: last,
    conversation: [{ role: first.role, content: opening }, ...rest].map(unmarked), chars: JSON.stringify(params.messages).length,
  };
}
/** Approves the plan the run is waiting on, the way the request handler does. */
function approve(state: AgentState) {
  answerAwaiting(state, "approve_plan");
  startAgentSegment(state);
}
const plan = (...steps: string[]): Reply => ({ tool: ["plan", { steps }] });
const progress = (...steps: [number, "done" | "skipped", string?][]): Reply =>
  ({ tool: ["report_progress", { steps: steps.map(([step, status, note]) => ({ step, status, ...(note ? { note } : {}) })) }] });
const editOn = (pageId: string, sectionId: string, heading: string): Reply => ({ tool: ["update_section_props", { pageId, sectionId, props: { heading } }] });
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
    // The prompt is ordered as it is cached: the tools and the rules, which never change, then the site
    // overview, both kept for an hour; then the conversation, which only grows.
    expect(model.calls.every((params) => params.model === SITE_GENERATION_MODEL)).toBe(true);
    expect(model.calls[3].system).toEqual(model.calls[2].system);
    expect(model.calls[3].tools).toEqual(model.calls[2].tools);
    expect(model.calls[2].system).toEqual([expect.objectContaining({ cache_control: { type: "ephemeral", ttl: "1h" } })]);
    expect(JSON.stringify(model.calls[2].system)).not.toContain("home-hero");
    for (const index of [1, 2, 3, 4]) {
      const [before, after] = [sent(model.calls[index - 1]), sent(model.calls[index])];
      // The overview stays as it was first sent, changes or not, so it is read from the cache on every step.
      expect(after.overview, `call ${index + 1}`).toBe(before.overview);
      expect(after.overviewMark).toEqual({ type: "ephemeral", ttl: "1h" });
      // Each call repeats the previous conversation exactly and adds to its end.
      expect(after.conversation.slice(0, before.conversation.length), `call ${index + 1}`).toEqual(before.conversation);
      expect(after.cached.cache_control).toEqual({ type: "ephemeral", ttl: "5m" });
    }
    expect(sent(model.calls[0]).overview).toMatch(/^SITE OVERVIEW/);
    expect(sent(model.calls[4]).overview).toContain("Plumbing done properly");
    // What changed since is in the tool results, and a fresh overview is one call away.
    const results = JSON.stringify(sent(model.calls[4]).conversation.at(-1));
    expect(results).toContain("Reliable plumbers");
    expect(JSON.stringify(state.messages)).not.toContain("SITE OVERVIEW (");

    startAgentSegment(state);
    expect(await run()).toBe("completed");
    expect(state.toolCalls).toBe(0);
    expect(state.runChanges).toBe(1);
    expect(state.tokenUsage.inputTokens).toBe(100 * (AGENT_LIMITS.toolCalls + 2));
    expect(events.at(-1)).toMatchObject({ type: "text", text: "All done." });
    expect(heading(changeset)).toBe("Reliable plumbers");
    expectAnswered(state.messages);
  });

  it("pauses when the token budget is spent, counting cached input at a tenth", async () => {
    const model = scripted(() => ({ tool: ["get_page", { pageId: fixtureIds.home, sectionIds: ["home-hero"] }], tokens: 30_000 }));
    const { state, run } = start(model);
    expect(await run()).toBe("paused");
    expect(model.calls).toHaveLength(Math.ceil(AGENT_LIMITS.tokens / 30_010));
    expect(state.pauseReason).toContain("allowance");
    expectAnswered(state.messages);

    const cached: AgentModel = async (params, options) => ({
      ...await model(params, options), usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 100_000 },
    }) as Anthropic.Message;
    const reads = start(cached);
    model.calls.length = 0;
    expect(await reads.run()).toBe("paused");
    expect(model.calls).toHaveLength(20);
  });

  it("sends each step the overview and the page being changed, not the pages already finished", async () => {
    const pages = [fixtureIds.home, fixtureIds.about, fixtureIds.pricing, fixtureIds.contact];
    const big = fixtureChangeset();
    // Pages as long as real ones, so reading all four does not fit in the context.
    for (const page of big.working.pages) {
      const content = (page.draft_data as { content: { props: Record<string, unknown> }[] }).content;
      content[0].props.heading = `${page.title} ${"long copy ".repeat(2_500)}`;
    }
    big.baseline = structuredClone(big.working);
    const sections = ["home-hero", "about-text", "pricing-plans", "contact-form"];
    const model = scripted((_params, call) => call <= 8
      ? (call % 2 ? { tool: ["get_page", { pageId: pages[(call - 1) / 2] }] } : editOn(pages[call / 2 - 1], sections[call / 2 - 1], `Heading ${call}`))
      : call === 9 ? progress([1, "done"]) : { text: "Done." });
    const { state, run } = start(model, undefined, big);
    // Work across four pages runs under an approved plan.
    state.plan = newAgentPlan(["Rewrite the heading of every page"]);
    expect(await run()).toBe("completed");
    expect(state.runChanges).toBe(4);

    const last = sent(model.calls.at(-1)!);
    const history = JSON.stringify(last.conversation);
    // The page read last is kept in full; the reads of finished pages were dropped in one go.
    expect(history).toContain("Contact long copy");
    expect(history).not.toContain("Home long copy");
    expect(history).not.toContain("About long copy");
    expect(history).toContain("removed to save context");
    // Every call still knows every page and section through the overview.
    for (const id of sections) expect(last.overview).toContain(`"sectionId":"${id}"`);
    expect(last.overview.length).toBeLessThan(3_000);
    // Shortening the conversation gave up its cached copy, so the overview caught up with the changes then.
    expect(last.overview).not.toBe(sent(model.calls[0]).overview);
    expect(last.overview).toContain("Heading 2");
    // What was dropped may be read again: the first page comes back in full when asked for.
    expect(Object.keys(state.reads ?? {})).not.toContain(`${fixtureIds.home}/home-hero`);
    // A change is confirmed in a few words, not by echoing the section back.
    const results = state.messages.flatMap((message) => typeof message.content === "string" ? []
      : message.content.flatMap((block) => block.type === "tool_result" ? [String(block.content)] : []));
    const written = results.filter((result) => result.startsWith('{"ok":true'));
    expect(written).toHaveLength(4);
    expect(written.every((result) => result.length < 100)).toBe(true);
    expect(Math.max(...model.calls.map((params) => sent(params).chars))).toBeLessThan(100_000);
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

  it("asks for credits only for a change that can be made, and does not count requests that change nothing", async () => {
    const invalid: Reply = { tool: ["update_section_props", { pageId: fixtureIds.home, sectionId: "home-hero", props: { notAProp: 1 } }] };
    const model = scripted((_params, call) => call <= 10 ? edit(`Heading ${call}`) : call === 11 ? invalid : call === 12 ? edit("Heading 10") : { text: "Done." });
    const { state, changeset, events, run } = start(model);
    expect(await run()).toBe("completed");
    expect(events.some((event) => event.type === "credit_confirmation")).toBe(false);
    expect(events.filter((event) => event.type === "tool_error").map((event) => String(event.message))).toEqual([
      expect.stringContaining("Unsupported section property: notAProp."),
    ]);
    // An edit that changes nothing is answered as such, without an error and without asking for credits.
    expect(events.filter((event) => event.type === "tool").at(-1)).toMatchObject({ result: { nothingChanged: true } });
    expect(state.awaiting).toBeUndefined();
    expect(state.runChanges).toBe(10);
    expect(changeset.changes).toHaveLength(10);
    expectAnswered(state.messages);
  });

  it("waits for the user on a plan or a question, and has bad input repaired by the small model before the main model's last try", async () => {
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
    // Putting right one tool call's input needs no planning: the small model repairs it, reading the same
    // rules and tools. If its repair is refused too, the main model has the last try.
    expect(invalid.calls.map((params) => params.model)).toEqual([SITE_GENERATION_MODEL, SMALL_EDIT_MODEL, SITE_GENERATION_MODEL]);
    expect(invalid.calls[1].tools).toEqual(invalid.calls[0].tools);
    expect(invalid.calls[1].system).toEqual([{ type: "text", text: (invalid.calls[0].system as Anthropic.TextBlockParam[])[0].text }]);
    expect(JSON.stringify(invalid.calls[1])).not.toContain("cache_control");
    const errors = repair.events.filter((event) => event.type === "tool_error").map((event) => String(event.message));
    expect(errors[0]).toMatch(/^Invalid tool input: variant: .*Repair the input and retry once\.$/);
    expect(errors[1]).toMatch(/still invalid after one repair attempt: .*Repair the input and retry\.$/);
    expect(errors[2]).toContain("still invalid after 2 repair attempts");
    expect(repair.state.pauseReason).toContain("after trying again");
    // The chat folds a slip the model is asked to repair into its repair; only the last refusal shows as failed.
    expect(repair.events.filter((event) => event.type === "tool_error").map((event) => event.repairable)).toEqual([true, true, false]);
    expect(repair.state.cost?.models[SMALL_EDIT_MODEL]).toMatchObject({ calls: 1 });

    // A plan or question written loosely is read as what it means instead of being refused.
    const loose = start(scripted(() => ({ tool: ["plan", { steps: "1. Rewrite the hero\n2. Add an FAQ" }] })));
    expect(await loose.run()).toBe("awaiting_approval");
    expect(loose.state.awaiting).toMatchObject({ payload: { steps: ["Rewrite the hero", "Add an FAQ"] } });
    const single = start(scripted(() => ({ tool: ["ask_user", { question: "Which tone?", options: "Friendly" }] })));
    expect(await single.run()).toBe("awaiting_input");
    expect(single.state.awaiting).toMatchObject({ payload: { options: ["Friendly"] } });
    expect(repair.changeset.changes).toHaveLength(0);
    expect(repair.changeset.working).toEqual(repair.changeset.baseline);
  });

  it("lets the repair retry succeed by naming the right page and section, and forgets a slip once it is repaired", async () => {
    const wrong = editOn(fixtureIds.about, "home-hero", "Reliable plumbers");
    const model = scripted((params, call) => {
      if (call === 1 || call === 3) return wrong;
      if (call === 2) {
        // The mismatch comes back with the pair that exists, which is all the retry needs.
        const result = (params.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0];
        expect(result).toMatchObject({ is_error: true, content: expect.stringMatching(/^Invalid tool input: sectionId home-hero is not on pageId .*Repair the input and retry once\.$/) });
        expect(String(result.content)).toContain(`"pageId":"${fixtureIds.home}"`);
        return editOn(fixtureIds.home, "home-hero", "Reliable plumbers");
      }
      return call === 4 ? editOn(fixtureIds.home, "home-hero", "Reliable local plumbers") : { text: "Done." };
    });
    const { state, changeset, events, run } = start(model);
    // A second slip later in the run gets its own retry instead of pausing the run.
    expect(await run()).toBe("completed");
    expect(heading(changeset)).toBe("Reliable local plumbers");
    expect(state.runChanges).toBe(2);
    const errors = events.filter((event) => event.type === "tool_error").map((event) => String(event.message));
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("Valid choices");
    expectAnswered(state.messages);
  });

  it("keeps working through an approved plan when the model stops early, until every step is done", async () => {
    const model = scripted((params, call) => {
      switch (call) {
        case 1: return plan("Rewrite the Home hero", "Rewrite the About intro", "Rewrite the Pricing heading");
        case 2: return editOn(fixtureIds.home, "home-hero", "Reliable plumbers");
        // Stops after the first page, as if the job were finished.
        case 3: return { text: "I have updated the home page. Shall I continue?" };
        case 4:
          expect(JSON.stringify(params.messages.at(-1))).toContain("2. Rewrite the About intro");
          return editOn(fixtureIds.about, "about-text", "About Harbour Plumbing");
        case 5: return progress([1, "done"], [2, "done"]);
        case 6: return editOn(fixtureIds.pricing, "pricing-plans", "Clear pricing");
        case 7: return progress([3, "done"]);
        default: return { text: "All three pages are updated." };
      }
    });
    const { state, changeset, run } = start(model);
    expect(await run()).toBe("awaiting_approval");
    approve(state);
    // Approval repeats the steps, so they are in front of the model when it starts.
    expect(JSON.stringify(state.messages.at(-1))).toContain("1. Rewrite the Home hero");
    expect(await run()).toBe("completed");
    expect(model.calls).toHaveLength(8);
    expect(changeset.changes.map((change) => change.pageId)).toEqual([fixtureIds.home, fixtureIds.about, fixtureIds.pricing]);
    expect(state.plan?.steps.map((step) => step.status)).toEqual(["done", "done", "done"]);
    expect(unfinishedPlanSteps(state.plan)).toEqual([]);
    expectAnswered(state.messages);
  });

  it("pauses with the open steps listed when the model will not finish the plan, and never ends as if it had", async () => {
    const model = scripted((_params, call) => call === 1 ? plan("Rewrite the Home hero", "Rewrite the About intro", "Change the phone number")
      : call === 2 ? editOn(fixtureIds.home, "home-hero", "Reliable plumbers")
        : call === 3 ? progress([1, "done"], [3, "skipped", "Contact details come from Business information."])
          : call === 8 ? editOn(fixtureIds.about, "about-text", "About Harbour Plumbing")
            : call === 9 ? progress([2, "done"]) : { text: "That is everything." });
    const { state, events, run } = start(model);
    expect(await run()).toBe("awaiting_approval");
    approve(state);

    // Told to carry on as often as allowed, then handed back to the user rather than marked complete.
    expect(await run()).toBe("paused");
    expect(model.calls).toHaveLength(4 + AGENT_LIMITS.nudges);
    expect(state.pauseReason).toContain("before the plan was finished");
    expect(unfinishedPlanSteps(state.plan)).toEqual([
      { step: "Rewrite the About intro" }, { step: "Change the phone number", reason: "Contact details come from Business information." },
    ]);
    expect(state.messages.at(-1)!.role).toBe("assistant");

    // Continue puts the open step in front of the model again; a skipped step is not asked for twice.
    startAgentSegment(state);
    const resumed = JSON.stringify(state.messages.at(-1));
    expect(resumed).toContain("2. Rewrite the About intro");
    expect(resumed).not.toContain("Change the phone number");
    expect(state.pauseReason).toBeUndefined();
    expect(await run()).toBe("completed");
    expect(unfinishedPlanSteps(state.plan)).toEqual([{ step: "Change the phone number", reason: "Contact details come from Business information." }]);
    expect(events.filter((event) => event.type === "tool_error")).toEqual([]);
    expectAnswered(state.messages);

    // Rejecting a new proposal made part-way leaves the approved plan, and what it still owes, in place.
    const revised = start(scripted((_params, call) => call === 1 ? plan("Rewrite the Home hero", "Rewrite the About intro") : plan("Start again")));
    await revised.run();
    approve(revised.state);
    expect(await revised.run()).toBe("awaiting_approval");
    answerAwaiting(revised.state, "reject_plan");
    expect(unfinishedPlanSteps(revised.state.plan)).toEqual([{ step: "Rewrite the Home hero" }, { step: "Rewrite the About intro" }]);

    // A go in which the model does nothing at all ends, still reporting what is open, so the run cannot be stuck.
    const idle = start(scripted((_params, call) => call === 1 ? plan("Rewrite the Home hero") : { text: "Done." }));
    await idle.run();
    approve(idle.state);
    expect(await idle.run()).toBe("completed");
    expect(unfinishedPlanSteps(idle.state.plan)).toEqual([{ step: "Rewrite the Home hero" }]);

    // Progress can only be reported on a plan that exists, and a skipped step needs its reason.
    const stray = start(scripted((_params, call) => call === 1 ? progress([1, "done"])
      : call === 2 ? { tool: ["report_progress", { steps: [{ step: 1, status: "skipped" }] }] } : { text: "Done." }));
    expect(await stray.run()).toBe("completed");
    expect(stray.events.filter((event) => event.type === "tool_error").map((event) => String(event.message))).toEqual([
      "There is no approved plan to report on.", expect.stringContaining("reason a step was skipped"),
    ]);
  });

  it("carries on after a reply that was cut off instead of ending the run, without running its half-written call", async () => {
    const model = scripted((_params, call) => call === 1 ? { ...edit("Cut"), stop: "max_tokens" as const }
      : call === 2 ? edit("Reliable plumbers") : { text: "Done." });
    const { state, changeset, run } = start(model);
    expect(await run()).toBe("completed");
    expect(heading(changeset)).toBe("Reliable plumbers");
    expect(changeset.changes).toHaveLength(1);
    expect(JSON.stringify(model.calls[1].messages)).toContain("cut off");
    expectAnswered(state.messages);

    const stuck = start(scripted(() => ({ text: "A very long reply", stop: "max_tokens" as const })));
    expect(await stuck.run()).toBe("paused");
    expect(stuck.state.pauseReason).toContain("cut off");
  });

  it("does not send the model's signed reasoning back after the site map has changed", async () => {
    const base = scripted((_params, call) => call === 1 ? edit("Reliable plumbers") : { text: "Done." });
    const model: AgentModel = async (params, options) => {
      const response = await base(params, options);
      return { ...response, content: [{ type: "thinking", thinking: "Consider the hero", signature: "bound-to-this-prompt" }, ...response.content] } as Anthropic.Message;
    };
    const { state, run } = start(model);
    expect(await run()).toBe("completed");
    expect(JSON.stringify(base.calls[1].messages)).not.toContain("bound-to-this-prompt");
    expect(JSON.stringify(state.messages)).not.toContain("bound-to-this-prompt");
    expectAnswered(state.messages);
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

describe("AI agent model routing", () => {
  const smallRun = (model: AgentModel) => start(model, newAgentState([{ role: "user", content: "Make the hero heading punchier" }], reservation, false, { route: "small" }));
  const models = (model: { calls: Params[] }) => model.calls.map((params) => params.model === SMALL_EDIT_MODEL ? "small" : "main");
  const texts = (events: AgentEvent[]) => events.filter((event) => event.type === "text").map((event) => event.text);

  it("gives an edit to one section to the small model, with a short prompt of its own", async () => {
    const model = scripted((_params, call) => call === 1 ? { tool: ["get_section", { pageId: fixtureIds.home, sectionId: "home-hero" }] }
      : call === 2 ? edit("Plumbing, sorted") : { text: "The hero heading is punchier now." });
    const { state, changeset, events, run } = smallRun(model);
    expect(await run()).toBe("completed");
    expect(models(model)).toEqual(["small", "small", "small"]);
    expect(heading(changeset)).toBe("Plumbing, sorted");
    expect(texts(events)).toEqual(["The hero heading is punchier now."]);
    // Its tools are the ones for small edits, and a way to hand anything else off.
    expect(model.calls[0].tools).toEqual(smallAgentTools);
    expect(JSON.stringify(model.calls[0].tools).length).toBeLessThan(JSON.stringify(agentTools).length / 3);
    const rules = (model.calls[0].system as Anthropic.TextBlockParam[])[0].text;
    expect(rules).toContain("hand_off");
    expect(rules).not.toContain("PLANS.");
    expect(sent(model.calls[0]).overview).toMatch(/^SITE OVERVIEW/);
    // Its requests are short and its cache is not priced, so nothing is marked for caching.
    expect(JSON.stringify(model.calls)).not.toContain("cache_control");
    expect(Object.keys(state.cost!.models)).toEqual([SMALL_EDIT_MODEL]);
    expect(state.route).toBe("small");
    expectAnswered(state.messages);
  });

  it("hands a request the small model cannot take to the main model, and keeps nothing of the small model's reply", async () => {
    const model = scripted((_params, call) => call === 1 ? { text: "Passing this on.", tool: ["hand_off", { reason: "Adds a section" }] }
      : call === 2 ? edit("Reliable plumbers") : { text: "Done." });
    const { state, events, run, escalations } = smallRun(model);
    expect(await run()).toBe("completed");
    expect(models(model)).toEqual(["small", "main", "main"]);
    expect(escalations).toEqual(["it handed the request off"]);
    // The main model answers the same conversation with its own rules and tools; the hand-off is not part of it.
    expect(sent(model.calls[1]).conversation).toEqual(sent(model.calls[0]).conversation);
    expect(model.calls[1].tools).toEqual(agentTools);
    expect((model.calls[1].system as Anthropic.TextBlockParam[])[0]).toMatchObject({ text: expect.stringContaining("PLANS."), cache_control: { type: "ephemeral", ttl: "1h" } });
    expect(JSON.stringify(state.messages)).not.toContain("hand_off");
    expect(texts(events)).toEqual(["Done."]);
    expect(events.filter((event) => event.type === "step").map((event) => event.name)).toEqual(["update_section_props"]);
    expect(state.route).toBe("main");
    // Both models' requests are counted, each at its own price.
    expect(state.cost!.models[SMALL_EDIT_MODEL].calls).toBe(1);
    expect(state.cost!.models[SITE_GENERATION_MODEL].calls).toBe(2);
    expectAnswered(state.messages);
  });

  it("takes the small model off a run that goes beyond one page, and has the main model plan the rest before changing it", async () => {
    const element = (sectionId: string, text: string): Reply => ({ tool: ["update_section_props", { pageId: fixtureIds.home, sectionId, props: { text } }] });
    const model = scripted((params, call) => {
      const script: Reply[] = [
        edit("Reliable plumbers"), editOn(fixtureIds.home, "home-services", "Our services"),
        // Elements of one layout count as the section they are in, so this is still three sections.
        element("home-why-0", "Why us"), element("home-why-1", "<p>We turn up on time.</p>"),
        // A second page: the small model's reply is dropped, and the main model's own attempt is sent back for a plan.
        editOn(fixtureIds.about, "about-text", "From the small model"), editOn(fixtureIds.about, "about-text", "Unplanned"),
        plan("About: rewrite the heading"), editOn(fixtureIds.about, "about-text", "From the main model"), progress([1, "done"]),
      ];
      if (call === 7) {
        const refused = (params.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0];
        expect(refused).toMatchObject({ is_error: true, content: expect.stringMatching(/not run: it changes a second page.*Call plan now/) });
      }
      return script[call - 1] ?? { text: "Done." };
    });
    const { state, changeset, events, run, escalations } = smallRun(model);
    const about = () => (changeset.working.pages[1].draft_data as { content: { props: Record<string, unknown> }[] }).content[0].props.heading;
    expect(await run()).toBe("awaiting_approval");
    expect(models(model)).toEqual(["small", "small", "small", "small", "small", "main", "main"]);
    expect(escalations).toEqual(["changes a second page"]);
    expect(state.scope).toEqual({ pageId: fixtureIds.home, sections: ["home-hero", "home-services", "home-why-section"] });
    // Neither attempt at the second page was run, and neither shows as a step: the user sees the plan.
    expect(about()).toBe("About us");
    expect(state.runChanges).toBe(4);
    expect(JSON.stringify(state.messages)).not.toContain("From the small model");
    expect(events.filter((event) => event.type === "tool_error")).toEqual([]);
    expect(events.filter((event) => event.type === "step")).toHaveLength(5);
    expect(events.at(-1)).toMatchObject({ type: "plan", steps: ["About: rewrite the heading"] });

    approve(state);
    expect(await run()).toBe("completed");
    expect(about()).toBe("From the main model");
    expect(state.runChanges).toBe(5);
    expect(unfinishedPlanSteps(state.plan)).toEqual([]);
    expectAnswered(state.messages);
  });

  it("sends the main model back to plan when its work outgrows one page or three sections, and never blocks it for good", async () => {
    const faq = { tool: ["insert_section", { pageId: fixtureIds.home, customSection: { background: "default", width: "contained", rowGap: 16,
      rows: [{ layout: "1", gap: 16, columns: [{ surface: "none", verticalAlign: "top", gap: 8, elements: [{ type: "Heading", text: "Questions", level: "h2", align: "left" }] }] }] } }] } as Reply;
    // Three sections of one page need no plan; a fourth section, here a new one, does.
    const model = scripted((_params, call) => [
      edit("Reliable plumbers"), editOn(fixtureIds.home, "home-services", "Our services"), faq, faq, plan("Home: add a questions section"),
    ][call - 1] ?? { text: "Done." });
    const planned = start(model);
    expect(await planned.run()).toBe("awaiting_approval");
    expect(planned.state).toMatchObject({ runChanges: 3, planDemands: 1, awaiting: { kind: "plan" } });
    expect(planned.events.filter((event) => event.type === "step").map((event) => event.name))
      .toEqual(["update_section_props", "update_section_props", "insert_section", "plan"]);

    // The theme, header and footer count as one part each, however often they are changed.
    const shared = scripted((_params, call) => [
      edit("Reliable plumbers"), { tool: ["update_theme", { patch: { radius: 8 } }] }, { tool: ["apply_theme_preset", { buttons: "pill" }] },
      { tool: ["update_footer", { props: { tagline: "Here to help" } }] }, { tool: ["update_header", { header: { desktop: { sticky: true } } }] },
      plan("Header: make it sticky"),
    ][call - 1] as Reply ?? { text: "Done." });
    const restyle = start(shared);
    expect(await restyle.run()).toBe("awaiting_approval");
    expect(restyle.state).toMatchObject({ runChanges: 4, planDemands: 1, scope: { pageId: fixtureIds.home, sections: ["home-hero", "@theme", "@footer"] } });

    // A model that will not plan is told twice, then let through: the run never hangs on the rule.
    const stubborn = scripted((_params, call) => call <= 4 ? (call === 1 ? edit("Reliable plumbers") : editOn(fixtureIds.about, "about-text", "About Harbour")) : { text: "Done." });
    const through = start(stubborn);
    expect(await through.run()).toBe("completed");
    expect(through.state).toMatchObject({ runChanges: 2, planDemands: 2 });
    expect(stubborn.calls).toHaveLength(5);
    expectAnswered(through.state.messages);
  });

  it("has the main model answer when the small model ends without changing anything", async () => {
    const model = scripted((_params, call) => call === 1 ? { text: "Your site looks fine to me." } : { text: "Three things would help most." });
    const { state, events, run } = smallRun(model);
    expect(await run()).toBe("completed");
    expect(models(model)).toEqual(["small", "main"]);
    // A question, or a request it could not carry out, is not the small model's to answer.
    expect(texts(events)).toEqual(["Three things would help most."]);
    expect(state.messages.at(-1)).toEqual({ role: "assistant", content: [expect.objectContaining({ text: "Three things would help most." })] });
  });

  it("moves a run to the main model when the small model's input is refused twice, or it is still going after eight steps", async () => {
    const invalid: Reply = { tool: ["update_section_props", { pageId: fixtureIds.home, sectionId: "home-hero", props: { variant: "nope" } }] };
    const model = scripted((_params, call) => call <= 2 ? invalid : call === 3 ? edit("Reliable plumbers") : { text: "Done." });
    const { state, changeset, events, run } = smallRun(model);
    expect(await run()).toBe("completed");
    expect(models(model)).toEqual(["small", "small", "main", "main"]);
    expect(heading(changeset)).toBe("Reliable plumbers");
    expect(events.filter((event) => event.type === "tool_error").map((event) => event.repairable)).toEqual([true, true]);
    expect(state.route).toBe("main");

    // On the main model's run the small model only repairs: a reply that is not the same tool again is dropped.
    const wandering = scripted((params, call) => call === 1 ? invalid
      : params.model === SMALL_EDIT_MODEL ? { text: "All done!" } : call === 3 ? edit("Reliable plumbers") : { text: "Done." });
    const mainRun = start(wandering);
    expect(await mainRun.run()).toBe("completed");
    expect(models(wandering)).toEqual(["main", "small", "main", "main"]);
    expect(texts(mainRun.events)).toEqual(["Done."]);
    expect(heading(mainRun.changeset)).toBe("Reliable plumbers");
    expect(JSON.stringify(mainRun.state.messages)).not.toContain("All done!");
    expectAnswered(mainRun.state.messages);

    const looping = scripted((params) => params.model === SMALL_EDIT_MODEL ? { tool: ["search_site", { query: "plumbing" }] } : { text: "Here is what I found." });
    const stuck = smallRun(looping);
    expect(await stuck.run()).toBe("completed");
    expect(models(looping)).toEqual([...Array.from({ length: 8 }, () => "small"), "main"]);
  });
});
