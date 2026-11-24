import { describe, expect, it } from "vitest";
import { fixtureIds } from "@/test/fixtures/agent-site";
import { DRY_RUN_SCRIPT, EVAL_CASES, runEval, scriptedModel, type EvalCase } from "./agent-evals";

// Worded as work across the site, so the scripted model stands in for the main model throughout.
const anything: EvalCase = { id: "harness", kind: "site", request: "Anything across the site", verify: () => null };
const hero = (props: Record<string, unknown>): [string, unknown] =>
  ["update_section_props", { pageId: fixtureIds.home, sectionId: "home-hero", props }];

describe("AI agent evals harness", () => {
  it("has sixteen requests, and passes a run that keeps the rules", async () => {
    expect(EVAL_CASES).toHaveLength(16);
    expect(new Set(EVAL_CASES.map((entry) => entry.id)).size).toBe(16);
    const result = await runEval(anything, scriptedModel(DRY_RUN_SCRIPT));
    expect(result).toMatchObject({ passed: true, failures: [], terminal: "completed", steps: 2, toolErrors: 0, changes: 1 });
    expect(result.notes).toEqual(["Home: 1 placeholder to fill in before publishing: [service area]."]);
    // The same run does not satisfy a request it did not carry out.
    expect((await runEval(EVAL_CASES[0], scriptedModel(DRY_RUN_SCRIPT))).failures).toEqual(["Expected several coordinated changes."]);
  });

  it("answers plans and questions like a cooperative user", async () => {
    const result = await runEval(anything, scriptedModel([
      ["plan", { steps: ["Rewrite the hero"] }],
      ["ask_user", { question: "Which tone?", options: ["Friendly", "Formal"] }],
      hero({ heading: "Friendly local plumbers" }),
      ["report_progress", { steps: [{ step: 1, status: "done" }] }],
      "Done.",
    ]));
    expect(result).toMatchObject({ passed: true, terminal: "completed", changes: 1 });

    // A run that stops with approved steps still open has not done what was asked.
    const partial = await runEval(anything, scriptedModel([
      ["plan", { steps: ["Rewrite the hero", "Rewrite the About page"] }],
      hero({ heading: "Friendly local plumbers" }),
      ["report_progress", { steps: [{ step: 1, status: "done" }] }],
      "Done.",
    ]));
    expect(partial.failures).toEqual(["The approved plan was not finished: Rewrite the About page"]);
  });

  it("fails runs that invent facts, break links or stage nothing", async () => {
    const invented = await runEval(anything, scriptedModel([
      hero({ heading: "Trusted by 2,500 customers since 1998", subheading: "Boiler servicing from $89. Call 555-014-9999 or hello@harbourplumbing.example." }),
      ["insert_section", { pageId: fixtureIds.home, designId: "nope" }],
      "Done.",
    ]));
    expect(invented.passed).toBe(false);
    expect(invented.toolErrors).toBe(1);
    expect(invented.firstAttemptFailures).toBe(1);
    expect(invented.failures.map((failure) => failure.split(":")[0])).toEqual([
      "Invented statistic", "Invented founding year", "Invented phone number", "Invented price",
    ]);

    const supplied = await runEval(anything, scriptedModel([
      hero({ subheading: "Boiler servicing from [price]. Call +15550100 or hello@harbourplumbing.example. Rated [rating] by [number] customers." }),
      "Done.",
    ]));
    expect(supplied.failures).toEqual([]);

    expect((await runEval(anything, scriptedModel(["I could not find anything to change."]))).failures).toEqual(["The run staged no changes."]);
    expect((await runEval(anything, scriptedModel([["get_site_overview", {}]]))).failures[0]).toBe("The run ended paused instead of completing.");
  });

  it("counts a refused first attempt once, however many repairs it takes", async () => {
    const wrong: [string, unknown] = ["update_section_props", { pageId: fixtureIds.about, sectionId: "home-hero", props: { heading: "Moved" } }];
    const result = await runEval(anything, scriptedModel([
      // Input that used to be refused and is now read as what it means is not a failure.
      ["update_section_props", { page_id: fixtureIds.home, section_id: "home-hero", props: JSON.stringify({ heading: "Friendly plumbers" }) }],
      wrong, hero({ heading: "Friendly local plumbers" }),
      ["insert_section", { pageId: fixtureIds.home, designId: "nope" }], ["insert_section", { pageId: fixtureIds.home, designId: "still-nope" }],
      "Done.",
    ]));
    expect(result).toMatchObject({ toolErrors: 3, firstAttemptFailures: 2, changes: 2 });
  });

  it("stops a run that reaches its cost limit", async () => {
    let calls = 0;
    const looping = scriptedModel([["get_site_overview", {}]]);
    const result = await runEval(anything, async (params, call) => {
      calls++;
      return { ...await looping(params, call), usage: { input_tokens: 50_000, output_tokens: 0 } } as Awaited<ReturnType<typeof looping>>;
    }, { maxCostUsd: 0.25 });
    // 50,000 input tokens cost $0.10, so the third call reaches the limit and the fourth is never made.
    expect(calls).toBe(3);
    expect(result.failures[0]).toBe("The run was stopped at its cost limit of $0.25.");
  });
});
