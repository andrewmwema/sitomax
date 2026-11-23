import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyAgentStep, settleAgentSteps, type AgentStep, type AgentStepUpdate } from "@/lib/ai/agent-steps";
import { AgentStepList } from "./agent-step-list";

const technical = 'Invalid tool input: sectionId Hero-1 is not on pageId 0000 (About). Valid choices: [{"pageId":"0001"}]. Repair the input and retry once.';
const step = (callId: string, status: AgentStepUpdate["status"], extra: Partial<AgentStepUpdate> = {}): AgentStepUpdate =>
  ({ callId, name: "update_section_props", label: "Updating Home", status, ...extra });
const play = (...updates: AgentStepUpdate[]) => updates.reduce<AgentStep[]>(applyAgentStep, []);
const render = (steps: AgentStep[], streaming = false) => renderToStaticMarkup(<AgentStepList steps={steps} streaming={streaming} />);

describe("AI agent steps", () => {
  it("shows a refused attempt and its repair as one step that worked", () => {
    const steps = play(
      { callId: "read", name: "get_page", label: "Reading Home", status: "done" },
      step("a", "running"), step("a", "retrying", { error: "This step could not be completed." }),
      step("b", "running"), step("b", "done"),
    );
    expect(steps).toEqual([
      { callId: "read", name: "get_page", label: "Reading Home", status: "done" },
      { callId: "b", name: "update_section_props", label: "Updating Home", status: "done" },
    ]);
    const markup = render(steps);
    expect(markup).not.toContain("text-red-600");
    expect(markup).not.toContain("could not be completed");
    expect(markup).not.toContain("Details");
  });

  it("shows an attempt being repaired as work in progress, and red only once the run ends without a repair", () => {
    const waiting = play(step("a", "running"), step("a", "retrying", { error: "This step could not be completed." }));
    expect(render(waiting, true)).toContain("animate-spin");
    expect(render(waiting, true)).not.toContain("text-red-600");
    // A second refusal of the same step replaces the first instead of adding a line.
    const twice = applyAgentStep(waiting, step("b", "retrying", { error: "This step could not be completed." }));
    expect(twice.map((entry) => entry.callId)).toEqual(["b"]);
    // An edit to another kind of step in between does not hide the failure.
    const other = applyAgentStep(twice, { callId: "c", name: "update_theme", label: "Updating the site theme", status: "done" });
    const ended = settleAgentSteps(other);
    expect(ended.map((entry) => entry.status)).toEqual(["error", "done"]);
    // A step refused for anything but its input is final at once, and a later edit of the same kind does not hide it.
    const refused = play(step("e", "running"), step("e", "error", { error: "This step could not be completed." }),
      { ...step("f", "running"), label: "Updating About" }, { ...step("f", "done"), label: "Updating About" });
    expect(refused.map((entry) => [entry.label, entry.status])).toEqual([["Updating Home", "error"], ["Updating About", "done"]]);
    // A repair that is refused too takes the place of the first attempt, in red.
    expect(play(step("g", "retrying"), step("h", "error", { error: "This step could not be completed." })).map((entry) => [entry.callId, entry.status])).toEqual([["h", "error"]]);
    const markup = render(ended);
    expect(markup).toContain("text-red-600");
    expect(markup).toContain("This step could not be completed.");
    expect(settleAgentSteps([{ ...step("d", "running") }], true)[0]).toMatchObject({ status: "error", error: "Stopped" });
  });

  it("keeps the technical error behind Details, which only agency staff are sent", () => {
    const client = play(step("a", "retrying", { error: "This step could not be completed." }), step("b", "done"));
    expect(render(client)).not.toMatch(/Details|sectionId|pageId|Invalid tool input/);
    expect(render(settleAgentSteps(play(step("a", "retrying", { error: "This step could not be completed." }))))).not.toMatch(/Details|sectionId|pageId/);

    const agency = play(step("a", "retrying", { error: "This step could not be completed.", details: [technical] }), step("b", "done"));
    expect(agency).toEqual([{ callId: "b", name: "update_section_props", label: "Updating Home", status: "done", details: [technical] }]);
    const markup = render(agency);
    // Still a normal step that worked; the error is there to expand.
    expect(markup).not.toContain("text-red-600");
    expect(markup).toMatch(/<details[^>]*><summary[^>]*>Details<\/summary>.*sectionId Hero-1 is not on pageId 0000/);
  });
});
