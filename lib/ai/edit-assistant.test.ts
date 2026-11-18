import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }),
} }) }));
vi.mock("./client", () => ({ requestAi: mocks.request }));
import { runEditAssistant } from "./edit-assistant";

const pageId = "00000000-0000-4000-8000-000000000001";
const siteId = "00000000-0000-4000-8000-000000000002";
const accountId = "00000000-0000-4000-8000-000000000003";
const plan = { type: "tool_use", name: "report_plan", input: { plan: "Make the heading shorter." } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup.mockResolvedValue({ data: { site: { id: siteId, account_id: accountId, business: {},
    theme: {}, draft_theme: null } }, error: null });
  mocks.request.mockResolvedValue({ stop_reason: "tool_use", content: [plan] });
});

describe("Ask AI server boundary", () => {
  it("uses one cached Haiku request with scoped context and non-strict section tools", async () => {
    mocks.request.mockResolvedValueOnce({ stop_reason: "tool_use", content: [plan, { type: "tool_use", name: "update_section_props",
      input: { sectionId: "hero", patch: { heading: "Our work" } } }] });
    const result = await runEditAssistant({ pageId, scope: "section", sectionId: "hero", sectionPosition: { index: 0, count: 2 },
      instruction: "Shorten this", sections: [{ type: "Hero", props: { id: "hero", heading: "Examples of our work", code: "<secret>" } }] });
    expect(result.operations).toEqual([{ name: "update_section_props", input: { sectionId: "hero", patch: { heading: "Our work" } } }]);
    expect(mocks.request).toHaveBeenCalledOnce();
    const args = mocks.request.mock.calls[0][0];
    expect(args).toMatchObject({ accountId, siteId, action: "edit_section", largeRewrite: false, cacheTtl: "5m" });
    expect(args.tools.map((entry: { name: string }) => entry.name)).not.toContain("update_theme");
    expect(args.tools.every((entry: { strict: boolean }) => entry.strict === false)).toBe(true);
    expect(args.messages[0].content).not.toContain("<secret>");
    expect(JSON.parse(args.messages[0].content).sections.map(({ id }: { id: string }) => id)).toEqual(["hero"]);
  });

  it("limits Sonnet to theme tools and returns an unsupported plan without applying anything", async () => {
    const result = await runEditAssistant({ pageId, scope: "theme", instruction: "Change logo with code" });
    const args = mocks.request.mock.calls[0][0];
    expect(args.largeRewrite).toBe(true);
    expect(args.tools.map((entry: { name: string }) => entry.name)).toEqual(["report_plan", "update_theme"]);
    expect(JSON.parse(args.messages[0].content)).not.toHaveProperty("sections");
    expect(result.operations).toEqual([]);
    mocks.request.mockResolvedValueOnce({ stop_reason: "tool_use", content: [plan, { type: "tool_use", name: "delete_section", input: { sectionId: "hero" } }] });
    await expect(runEditAssistant({ pageId, scope: "theme", instruction: "Delete the hero" })).rejects.toThrow("unsupported");
  });
});
