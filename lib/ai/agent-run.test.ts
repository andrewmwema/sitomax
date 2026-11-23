import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { fixtureChangeset, fixtureIds } from "@/test/fixtures/agent-site";

const mocks = vi.hoisted(() => ({
  usage: {
    appendAiAgentMessage: vi.fn(), checkLimit: vi.fn(), claimAiAgentRun: vi.fn(), createAiAgentRun: vi.fn(),
    createAiAgentThread: vi.fn(), getAiAgentRunUsage: vi.fn(), loadAiAgentRunState: vi.fn(), recordUsage: vi.fn(),
    releaseFailedRequest: vi.fn(), reserveAiAgentSlot: vi.fn(), saveAiAgentRun: vi.fn(), upgradeAiAgentRequest: vi.fn(),
  },
  isAgency: vi.fn(),
}));
vi.mock("./usage", () => mocks.usage);
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.isAgency }) }));
import { executeAgentRequest, newAgentState, type AgentEvent, type AgentModel } from "./agent";
import { AiUserError } from "./errors";

type Supabase = Parameters<typeof executeAgentRequest>[0];
const threadId = "00000000-0000-4000-8000-0000000000b1";
const runId = "00000000-0000-4000-8000-0000000000b2";
const reservation = "00000000-0000-4000-8000-0000000000b3";
const fixture = fixtureChangeset().working;
const savedRun = { status: "paused", changeset: fixtureChangeset() as unknown };

/** The few reads the run makes with the user's own access. */
function supabase(): Supabase {
  const rows: Record<string, unknown> = {
    sites: { ...fixture.site, theme: fixture.theme, draft_header: fixture.header },
    pages: fixture.pages, posts: fixture.posts, blog_settings: null, ai_agent_threads: { id: threadId, site_id: fixtureIds.site },
    ai_agent_runs: { id: runId, thread_id: threadId, request_id: reservation, ...savedRun },
  };
  return { from: (table: string) => {
    const result = { data: rows[table] ?? null, error: null };
    const chain: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => resolve(result), maybeSingle: async () => result };
    for (const method of ["select", "eq", "order", "limit"]) chain[method] = () => chain;
    return chain;
  } } as unknown as Supabase;
}
const reply = (content: unknown[]) => ({
  id: "msg", type: "message", role: "assistant", model: "test", stop_sequence: null, content,
  stop_reason: content.some((block) => (block as { type: string }).type === "tool_use") ? "tool_use" : "end_turn",
  usage: { input_tokens: 1000, output_tokens: 100 },
}) as unknown as Anthropic.Message;
const edit = reply([{ type: "tool_use", id: "call-1", name: "update_section_props",
  input: { pageId: fixtureIds.home, sectionId: "home-hero", props: { heading: "Reliable plumbers", buttonLink: "/quote" } } }]);
const done = reply([{ type: "text", text: "I rewrote the hero.", citations: null }]);
function script(...steps: (Anthropic.Message | Error)[]): AgentModel {
  return async (_params, { onText }) => {
    const next = steps.shift() ?? done;
    if (next instanceof Error) throw next;
    for (const block of next.content) if (block.type === "text") onText(block.text);
    return next;
  };
}
const providerError = (status: number, type: string) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type, message: "Provider detail" } }, "Provider detail", new Headers());
async function request(body: Record<string, unknown>, model: AgentModel) {
  const events: AgentEvent[] = [];
  await executeAgentRequest(supabase(), "user-1", body, (event) => events.push(event), undefined, model);
  return events;
}
const start = { action: "start", siteId: fixtureIds.site, message: "Improve the hero" };
const lastSave = () => mocks.usage.saveAiAgentRun.mock.calls.at(-1)![3] as { status: string; changeset: { quality?: unknown }; finished_at: string | null };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  savedRun.status = "paused";
  savedRun.changeset = fixtureChangeset();
  mocks.usage.checkLimit.mockResolvedValue({ id: reservation, model: "test" });
  mocks.usage.createAiAgentThread.mockResolvedValue(threadId);
  mocks.usage.createAiAgentRun.mockResolvedValue(runId);
  mocks.usage.claimAiAgentRun.mockResolvedValue(true);
  mocks.usage.getAiAgentRunUsage.mockResolvedValue({ charge: "credits", credits: 1 });
  mocks.usage.loadAiAgentRunState.mockResolvedValue(newAgentState([{ role: "user", content: "Improve the hero" }], reservation));
  mocks.isAgency.mockResolvedValue({ data: false, error: null });
});

describe("AI agent request", () => {
  it("checks the account limit before reserving, then runs, checks quality, saves and reports the cost", async () => {
    const events = await request(start, script(edit, done));
    expect(mocks.usage.reserveAiAgentSlot).toHaveBeenCalledWith(fixtureIds.account);
    expect(mocks.usage.reserveAiAgentSlot.mock.invocationCallOrder[0]).toBeLessThan(mocks.usage.checkLimit.mock.invocationCallOrder[0]);
    expect(events.map((event) => event.type)).toEqual(["run", "step", "tool", "text", "done"]);
    expect(events.at(-1)).toMatchObject({
      status: "completed", summary: "I rewrote the hero.", usage: { charge: "credits", credits: 1 },
      review: { changes: [{ kind: "section_props" }], quality: { fixed: [], notes: [expect.stringContaining("/quote, which is not a page")] } },
    });
    // Token counts and provider cost never travel in the event stream.
    expect(JSON.stringify(events)).not.toMatch(/costUsd|tokenUsage|inputTokens/);
    expect(lastSave()).toMatchObject({ status: "completed", changeset: { quality: { fixed: [] } }, finished_at: expect.any(String) });
    expect(mocks.usage.recordUsage).toHaveBeenCalledWith({ id: reservation, model: expect.any(String) },
      expect.objectContaining({ inputTokens: 2000, outputTokens: 200 }));
    expect(mocks.usage.releaseFailedRequest).not.toHaveBeenCalled();
  });

  it("refuses a request over the account limit before any credit is reserved or run created", async () => {
    mocks.usage.reserveAiAgentSlot.mockRejectedValue(new AiUserError("Your account has reached its hourly AI agent limit."));
    await expect(request(start, script(done))).rejects.toThrow(AiUserError);
    expect(mocks.usage.checkLimit).not.toHaveBeenCalled();
    expect(mocks.usage.createAiAgentRun).not.toHaveBeenCalled();
    // The same limit guards Continue, and leaves the paused run as it was.
    await expect(request({ action: "continue", threadId, runId }, script(done))).rejects.toThrow(AiUserError);
    expect(mocks.usage.claimAiAgentRun).not.toHaveBeenCalled();
    expect(mocks.usage.saveAiAgentRun).not.toHaveBeenCalled();
  });

  it("pauses a run when the AI service is busy, so Continue retries it without a new charge", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const events = await request(start, script(edit, providerError(529, "overloaded_error")));
    expect(events.slice(-2)).toMatchObject([
      { type: "error", message: "The AI service is busy or did not respond. Your progress is saved: press Continue to try again." },
      { type: "paused", continueAvailable: true },
    ]);
    expect(lastSave()).toMatchObject({ status: "paused", finished_at: null });
    expect(mocks.usage.recordUsage).not.toHaveBeenCalled();
    expect(mocks.usage.releaseFailedRequest).not.toHaveBeenCalled();

    // The agency also sees which provider error it was.
    mocks.isAgency.mockResolvedValue({ data: true, error: null });
    const agency = await request(start, script(providerError(429, "rate_limit_error")));
    expect(agency.find((event) => event.type === "error")!.message).toMatch(/press Continue to try again\. Anthropic HTTP 429 \(rate_limit_error\): Provider detail/);
    log.mockRestore();

    savedRun.status = "paused";
    const resumed = await request({ action: "continue", threadId, runId }, script(done));
    expect(mocks.usage.claimAiAgentRun).toHaveBeenCalledWith(expect.anything(), threadId, runId, "paused");
    expect(mocks.usage.checkLimit).toHaveBeenCalledTimes(2);
    expect(resumed.at(-1)).toMatchObject({ type: "done", status: "completed" });
  });

  it("sends clients a plain sentence for a failed step, and the technical error and ids only to agency staff", async () => {
    const wrong = reply([{ type: "tool_use", id: "call-0", name: "update_section_props",
      input: { pageId: fixtureIds.about, sectionId: "home-hero", props: { heading: "Reliable plumbers" } } }]);
    const client = await request({ ...start, context: `Focus on this context: selected section "Hero" (pageId ${fixtureIds.home}, sectionId home-hero).` }, script(wrong, edit, done));
    expect(client.map((event) => event.type)).toEqual(["run", "step", "tool_error", "step", "tool", "text", "done"]);
    const failed = client.find((event) => event.type === "tool_error")!;
    expect(failed).toMatchObject({ callId: "call-0", name: "update_section_props", message: "This step could not be completed.", repairable: true });
    expect(failed).not.toHaveProperty("details");
    // What the tool told the model, and what it returned, stay on the server.
    expect(JSON.stringify(failed)).not.toMatch(/is not on pageId|Valid choices|Repair the input/);
    expect(client.find((event) => event.type === "tool")).not.toHaveProperty("result");
    // The model is given the editor's context; the conversation the user reads holds only their own words.
    const saved = mocks.usage.createAiAgentRun.mock.calls[0][2] as { run_state: { messages: { content: string }[] } };
    expect(saved.run_state.messages[0].content).toBe(`Improve the hero\n\nFocus on this context: selected section "Hero" (pageId ${fixtureIds.home}, sectionId home-hero).`);
    expect(mocks.usage.appendAiAgentMessage.mock.calls[0][3]).toMatchObject({ role: "user", content: "Improve the hero" });
    expect(mocks.usage.createAiAgentThread).toHaveBeenCalledWith(expect.anything(), "user-1", fixtureIds.site, "Improve the hero");

    // A plan step that still names an id is shown without it.
    const planned = await request(start, script(reply([{ type: "tool_use", id: "plan-0", name: "plan", input: { steps: [
      `Home (pageId ${fixtureIds.home}): rewrite the hero "Hero-${fixtureIds.post}" heading`, "About: add our story, founded 2004-2010 (sectionId about-text-2)",
    ] } }])));
    expect(planned.find((event) => event.type === "plan")).toMatchObject({ steps: ["Home: rewrite the hero heading", "About: add our story, founded 2004-2010"] });

    mocks.isAgency.mockResolvedValue({ data: true, error: null });
    const agency = await request(start, script(wrong, edit, done));
    expect(agency.find((event) => event.type === "tool_error")).toMatchObject({
      message: "This step could not be completed.", details: expect.stringMatching(/^Invalid tool input: sectionId home-hero is not on pageId .*Repair the input and retry once\.$/),
    });
  });

  it("never ends an approved plan quietly: open steps are listed with Continue, and skipped ones with the reason", async () => {
    const call = (name: string, input: unknown) => reply([{ type: "tool_use", id: `call-${name}`, name, input }]);
    const waiting = newAgentState([
      { role: "user", content: "Rewrite the home and about pages" },
      { role: "assistant", content: [{ type: "tool_use", id: "plan-1", name: "plan", input: {} }] },
    ], reservation);
    waiting.awaiting = { kind: "plan", toolUseId: "plan-1", toolName: "plan",
      payload: { steps: ["Rewrite the Home hero", "Rewrite the About intro", "Add our prices"] } };
    savedRun.status = "awaiting_approval";
    mocks.usage.loadAiAgentRunState.mockResolvedValue(waiting);

    // The model does the first page and then stops, however often it is told to carry on.
    const events = await request({ action: "approve_plan", threadId, runId }, script(edit));
    expect(events.at(-1)).toMatchObject({
      type: "paused", continueAvailable: true, summary: expect.stringContaining("before the plan was finished"),
      unfinished: [{ step: "Rewrite the Home hero" }, { step: "Rewrite the About intro" }, { step: "Add our prices" }],
    });
    expect(lastSave()).toMatchObject({ status: "paused", finished_at: null });
    expect(mocks.usage.recordUsage).not.toHaveBeenCalled();

    // Continue resumes from the saved plan; what cannot be done is reported, not dropped.
    const paused = (mocks.usage.saveAiAgentRun.mock.calls.at(-1)![3] as { run_state: unknown; changeset: unknown });
    savedRun.status = "paused";
    savedRun.changeset = paused.changeset;
    mocks.usage.loadAiAgentRunState.mockResolvedValue(structuredClone(paused.run_state));
    const resumed = await request({ action: "continue", threadId, runId }, script(
      call("update_section_props", { pageId: fixtureIds.about, sectionId: "about-text", props: { heading: "About Harbour Plumbing" } }),
      call("report_progress", { steps: [{ step: 1, status: "done" }, { step: 2, status: "done" },
        { step: 3, status: "skipped", note: "No prices are on file." }] }),
    ));
    expect(resumed.at(-1)).toMatchObject({
      type: "done", status: "completed", unfinished: [{ step: "Add our prices", reason: "No prices are on file." }],
      review: { changes: [{ kind: "section_props" }, { kind: "section_props" }] },
    });
  });

  it("ends a run the AI service rejects, keeping the staged changes for review and charging only for work done", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const events = await request(start, script(edit, providerError(400, "invalid_request_error")));
    expect(events.slice(-2)).toMatchObject([
      { type: "error", message: "The AI service could not process this request. Changes staged so far are saved for you to review." },
      { type: "done", status: "failed", review: { changes: [{ kind: "section_props" }] } },
    ]);
    expect(lastSave()).toMatchObject({ status: "failed", finished_at: expect.any(String) });
    expect(mocks.usage.recordUsage).toHaveBeenCalledTimes(1);

    // Nothing was generated, so the reservation is released instead of charged.
    vi.clearAllMocks();
    await request(start, script(providerError(401, "authentication_error")));
    expect(mocks.usage.recordUsage).not.toHaveBeenCalled();
    expect(mocks.usage.releaseFailedRequest).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
