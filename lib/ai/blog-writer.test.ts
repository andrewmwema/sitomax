import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ site: vi.fn(), categories: vi.fn(), request: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({
  supabase: { from: (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: table === "sites" ? mocks.site : vi.fn(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.categories()).then(resolve),
    };
    return query;
  } },
}) }));
vi.mock("./client", () => ({ requestAi: mocks.request }));

import { runBlogWriterAi } from "./blog-writer";

const siteId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const categoryId = "00000000-0000-4000-8000-000000000003";
const message = (name: string, input: unknown) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", name, input }],
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.site.mockResolvedValue({
    data: { id: siteId, account_id: accountId, business: { businessName: "Example Co", tone: "clear and warm" } },
    error: null,
  });
  mocks.categories.mockResolvedValue({ data: [{ id: categoryId, name: "Guides" }], error: null });
});

describe("blog writer AI", () => {
  it("creates a sanitized draft preview using the Sonnet-metered path without changing a post", async () => {
    mocks.request.mockResolvedValue(message("draft_blog_post", {
      title: "A useful guide", subtitle: "", excerpt: "An overview.", notes: ["Verify bracketed details."],
      blocks: [{ type: "paragraph", text: "Useful text <script>alert(1)</script>" }],
    }));
    const result = await runBlogWriterAi({ mode: "draft", siteId, topic: "Write an outline about our service" });
    expect(result.mode).toBe("draft");
    if (result.mode !== "draft") throw new Error("Expected draft result");
    expect(result.content.blocks).toEqual([{
      type: "paragraph", html: "<p>Useful text &lt;script&gt;alert(1)&lt;/script&gt;</p>",
    }]);
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
      action: "rewrite_text", usageType: "blog_ai", largeRewrite: true, accountId, siteId,
    }));
    expect(mocks.request.mock.calls[0][0].messages[0].content).toContain("Example Co");
    expect(mocks.request.mock.calls[0][0].system).toContain("Never invent");
  });

  it("previews a selection rewrite via the small-task metered path", async () => {
    mocks.request.mockResolvedValue(message("rewrite_blog_text", {
      text: "A clearer sentence.", notes: ["Verify that this rewrite preserves the intended meaning."],
    }));
    const result = await runBlogWriterAi({
      mode: "rewrite", siteId, text: "Original sentence.", instruction: "improve", tone: "",
    });
    expect(result).toEqual({
      mode: "rewrite", text: "A clearer sentence.",
      notes: ["Verify that this rewrite preserves the intended meaning."],
    });
    expect(mocks.request.mock.calls[0][0].action).toBe("rewrite_text");
    expect("largeRewrite" in mocks.request.mock.calls[0][0]).toBe(false);
  });

  it("limits SEO category suggestions to categories available on the site", async () => {
    mocks.request.mockResolvedValue(message("suggest_blog_seo", {
      title: "A better title", subtitle: "", excerpt: "", seo_title: "S".repeat(50),
      seo_description: "A".repeat(140), cover_alt: "", tag_names: ["planning"],
      category_id: categoryId, notes: ["Verify factual claims before publishing."],
    }));
    const result = await runBlogWriterAi({
      mode: "suggest", siteId, title: "Draft", subtitle: "", excerpt: "", bodyText: "", coverDescription: "",
    });
    expect(result.mode).toBe("suggest");
    expect(mocks.request.mock.calls[0][0].messages[0].content).toContain("Guides");
  });

  it("does not call AI for an inaccessible site", async () => {
    mocks.site.mockResolvedValue({ data: null, error: null });
    await expect(runBlogWriterAi({ mode: "draft", siteId, topic: "A topic" })).rejects.toThrow("unavailable");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("rejects a category outside the site's category list", async () => {
    mocks.request.mockResolvedValue(message("suggest_blog_seo", {
      title: "", subtitle: "", excerpt: "", seo_title: "S".repeat(50),
      seo_description: "A".repeat(140), cover_alt: "", tag_names: [],
      category_id: accountId, notes: ["Verify factual claims before publishing."],
    }));
    await expect(runBlogWriterAi({
      mode: "suggest", siteId, title: "", subtitle: "", excerpt: "", bodyText: "", coverDescription: "",
    })).rejects.toThrow("not one of this site's categories");
  });
});
