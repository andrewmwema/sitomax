import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ supabase: { from: mocks.from } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { setBlogPostStatus } from "./actions";

const postId = "00000000-0000-4000-8000-000000000001";
const row = {
    id: postId, site_id: "00000000-0000-4000-8000-000000000002", status: "draft",
    updated_at: "2026-01-01T00:00:00Z",
    title: "Edited draft", subtitle: "", slug: "edited-draft", excerpt: "",
    draft_content: { version: 1, blocks: [{ type: "paragraph", html: "<p>Reviewed text.</p>" }] },
    cover_image: "", cover_alt: "", thumbnail_image: "", thumbnail_alt: "",
    author_id: null, category_id: null, featured: false, layout_override: null,
    seo_title: "", seo_description: "", canonical_url: "", noindex: false,
};
const snapshot = {
  version: 1, blocks: row.draft_content.blocks,
  metadata: expect.objectContaining({ title: "Edited draft", slug: "edited-draft", reading_minutes: 1 }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => {
    if (table === "posts") return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: mocks.update,
    };
    if (table === "post_tag_links") return {
      select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }),
    };
    if (table === "sites") return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "Africa/Nairobi" }, error: null }) }) }),
    };
    throw new Error(`Unexpected table: ${table}`);
  });
});

it("publishes an edited draft as a snapshot without validating database bookkeeping as draft fields", async () => {
  mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });

  await expect(setBlogPostStatus(postId, "published")).resolves.toMatchObject({ status: "success" });
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
    status: "published",
    published_content: snapshot,
  }));
  expect(mocks.revalidate).toHaveBeenCalledWith("/s/[site]/[[...slug]]", "page");
});

it("schedules a frozen snapshot in the site's timezone without publishing it immediately", async () => {
  const checkVersion = vi.fn(() => ({ select: () => ({ maybeSingle: async () => ({ data: { id: postId }, error: null }) }) }));
  mocks.update.mockReturnValue({ eq: () => ({ eq: checkVersion }) });
  const year = new Date().getUTCFullYear() + 1;
  await expect(setBlogPostStatus(postId, "scheduled", `${year}-01-01T09:00`)).resolves.toMatchObject({ status: "success" });
  expect(checkVersion).toHaveBeenCalledWith("updated_at", row.updated_at);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
    status: "scheduled", publish_at: `${year}-01-01T06:00:00.000Z`, scheduled_content: snapshot,
    has_unpublished_changes: false,
  });
});

it("reports a concurrent change instead of claiming that the post was scheduled", async () => {
  mocks.update.mockReturnValue({ eq: () => ({ eq: () => ({
    select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
  }) }) });
  const year = new Date().getUTCFullYear() + 1;
  await expect(setBlogPostStatus(postId, "scheduled", `${year}-01-01T09:00`)).resolves.toMatchObject({
    status: "error", message: expect.stringContaining("changed while scheduling"),
  });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
