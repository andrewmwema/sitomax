import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Check } from "./types";

const mocks = vi.hoisted(() => ({ create: vi.fn(), rpc: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mocks.create };
  },
}));
vi.mock("./worker", () => ({ graderRpc: mocks.rpc }));
import { makeSummary } from "./summary";

const checks: Check[] = ["a", "b", "c"].map((id) => ({
  id, category: "seo", status: "warn", value: null, detail: "Found issue", fix: "Review it",
}));
const summary = {
  headline: "There are improvements to consider.",
  summary: "The scan found issues. Some details need review. The site can be improved.",
  top_issues: ["a", "b", "c"].map((id) => ({ check_id: id, title: id, why_it_matters: "Review this.", fix: "Improve it." })),
  fix_plan: ["One", "Two", "Three", "Four", "Five"],
  sitomax_pitch: "SitoMax can help make improvements. The team can review the findings with you.",
};

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  mocks.create.mockReset();
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); });

it("records provider usage and accepts a schema-valid summary grounded in issue IDs", async () => {
  mocks.create.mockResolvedValue({ model: "claude-haiku-5-5", usage: { input_tokens: 100, output_tokens: 20 },
    content: [{ type: "tool_use", name: "report", input: summary }] });
  expect(await makeSummary("report-id", checks)).toEqual(summary);
  expect(mocks.rpc).toHaveBeenCalledWith("grader_record_ai_usage",
    expect.objectContaining({ p_input: 100, p_output: 20 }));
});

it("does not expose summaries referencing an unverified finding", async () => {
  mocks.create.mockResolvedValue({ model: "claude-haiku-5-5", usage: { input_tokens: 100, output_tokens: 20 },
    content: [{ type: "tool_use", name: "report", input: { ...summary,
      top_issues: [{ ...summary.top_issues[0], check_id: "invented" }, ...summary.top_issues.slice(1)] } }] });
  expect(await makeSummary("report-id", checks)).toBeNull();
  expect(mocks.rpc).toHaveBeenCalledOnce();
});

it("keeps the leading grounded issues and sentences when the model returns extra", async () => {
  const issues = ["a", "b", "c", "d"].map((id) => ({ id, category: "seo" as const, status: "fail" as const, value: null, detail: "Found issue", fix: "Review it" }));
  mocks.create.mockResolvedValue({ model: "claude-haiku-5-5", usage: { input_tokens: 100, output_tokens: 20 },
    content: [{ type: "tool_use", name: "report", input: { ...summary,
      summary: `${summary.summary} A fourth sentence. A fifth sentence.`,
      top_issues: ["invented", "a", "a", "b", "c", "d"].map((id) => ({ check_id: id, title: id, why_it_matters: "Review this.", fix: "Improve it." })),
      sitomax_pitch: `${summary.sitomax_pitch} A third sentence.` } }] });
  const result = await makeSummary("report-id", issues);
  expect(result?.top_issues.map((issue) => issue.check_id)).toEqual(["a", "b", "c"]);
  expect(result?.summary).toBe(`${summary.summary} A fourth sentence.`);
  expect(result?.sitomax_pitch).toBe(summary.sitomax_pitch);
});
