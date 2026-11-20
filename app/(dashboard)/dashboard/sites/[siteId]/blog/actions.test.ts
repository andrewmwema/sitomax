import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: { from: mocks.from } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { setBlogPostStatus } from "./actions";

it("publishes an edited draft as a snapshot without validating database bookkeeping as draft fields", async () => {
  const postId = "00000000-0000-4000-8000-000000000001";
  const row = {
    id: postId, site_id: "00000000-0000-4000-8000-000000000002", status: "draft",
    title: "Edited draft", subtitle: "", slug: "edited-draft", excerpt: "",
    draft_content: { version: 1, blocks: [{ type: "paragraph", html: "<p>Reviewed text.</p>" }] },
    cover_image: "", cover_alt: "", thumbnail_image: "", thumbnail_alt: "",
    author_id: null, category_id: null, featured: false, layout_override: null,
    seo_title: "", seo_description: "", canonical_url: "", noindex: false,
  };
  mocks.from.mockImplementation((table: string) => {
    if (table === "posts") return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: mocks.update,
    };
    if (table === "post_tag_links") return {
      select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }),
    };
    throw new Error(`Unexpected table: ${table}`);
  });
  mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });

  await expect(setBlogPostStatus(postId, "published")).resolves.toMatchObject({ status: "success" });
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
    status: "published",
    published_content: {
      version: 1, blocks: row.draft_content.blocks,
      metadata: expect.objectContaining({ title: "Edited draft", slug: "edited-draft", reading_minutes: 1 }),
    },
  }));
  expect(mocks.revalidate).toHaveBeenCalledWith("/s/[site]/[[...slug]]", "page");
});
