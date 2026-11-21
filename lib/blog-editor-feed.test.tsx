import { createClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { BlogPosts, type BlogFeedMetadata, type BlogPostsProps } from "@/components/blocks/blog-posts";
import { loadEditorBlogFeed } from "./blog-editor-feed";
import { brand } from "./brand";

vi.mock("@/components/blocks/ui/rich-text", () => ({ RichTextContent: () => null }));
vi.mock("@/lib/puck/fields", () => ({
  designField: () => ({}), iconField: () => ({}), imageField: () => ({}),
  linkField: () => ({}), richHeadingField: () => ({}), richTextField: () => ({}),
}));
vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));

const site = { id: "site", subdomain: "client", custom_domain: "example.com", domain_verified: true };
const metadata = {
  title: "Design a welcoming home", subtitle: "", slug: "welcoming-home", excerpt: "Small details make a big difference.",
  cover_image: "/samples/home-interior.jpg", cover_alt: "Living room",
  thumbnail_image: "/samples/kitchen.jpg", thumbnail_alt: "Kitchen", author: null, category: null,
  tags: [], featured: true, layout_override: null, seo_title: "", seo_description: "", canonical_url: "",
  noindex: false, reading_minutes: 3,
};

function renderFeed(feed: BlogFeedMetadata, props: Partial<BlogPostsProps> = {}, isEditing = true) {
  return renderToStaticMarkup(BlogPosts.render({
    source: "latest", category: "", count: 3, variant: "grid", showExcerpt: true, showDate: true,
    showAuthor: true, showViewAll: true, ...props, id: "feed",
    puck: { metadata: feed, isEditing, renderDropZone: () => null, dragRef: null },
  }));
}

it("renders published images and excerpts in the canvas using the site's blog URL", async () => {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname.endsWith("/blog_settings")) {
      expect(url.searchParams.get("site_id")).toBe("eq.site");
      return Response.json({ blog_path: "/blog", draft_settings: {
        timezone: "UTC", blog_path: "/journal", posts_per_page: 10, index_layout: "grid",
        default_post_layout: "classic", show_author: true, show_date: true, show_reading_time: true,
        show_share_links: true, show_in_menu: true, noindex_tags: true, cta_text: "",
        cta_button_text: "", cta_link: "",
      } });
    }
    if (url.pathname.endsWith("/sites")) return Response.json({ timezone: "UTC" });
    expect(url.pathname).toBe("/rest/v1/posts");
    expect(url.searchParams.get("site_id")).toBe("eq.site");
    expect(url.searchParams.get("status")).toBe("eq.published");
    expect(url.searchParams.get("select")).toContain("metadata:published_content->metadata");
    return Response.json([
      { id: "first", slug: "welcoming-home", published_at: "2026-11-20T12:00:00Z", metadata },
      { id: "second", slug: "small-spaces", published_at: "2026-11-18T12:00:00Z",
        metadata: { ...metadata, title: "Ideas for small spaces", thumbnail_image: "" } },
    ]);
  });
  const supabase = createClient("https://db.example.test", "key", { global: { fetch }, auth: { persistSession: false } });
  const feed = await loadEditorBlogFeed(supabase, site);
  expect(feed.siteBlogSettingsPending).toBe(true);
  const markup = renderFeed(feed, { heading: "Our journal", variant: "featured-list" });
  expect(markup).toContain(">Our journal</h2>");
  expect(markup).toContain('src="/samples/kitchen.jpg"');
  expect(markup).toContain('src="/samples/home-interior.jpg"');
  expect(markup).toContain("Small details make a big difference.");
  expect(markup).toContain(`href="${brand.appUrl}/s/client/journal/welcoming-home?preview=1"`);
  expect(markup).toContain(`href="${brand.appUrl}/s/client/journal?preview=1"`);
  expect(markup.match(/Ideas for small spaces/g)).toHaveLength(1);
  expect(renderFeed(feed, { showExcerpt: false })).not.toContain(metadata.excerpt);
});

it("shows editor-only empty and unavailable states without publishing placeholder content", () => {
  expect(renderFeed({})).toContain("Publish a blog post to preview it here.");
  expect(renderFeed({ siteBlogFeedUnavailable: true })).toContain("Blog preview unavailable");
  expect(renderFeed({}, {}, false)).toBe("");
});
