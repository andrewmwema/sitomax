import { describe, expect, it } from "vitest";
import {
  blogMetadata, parseBlogRoute, selectBlogPosts, type PublicBlogPost, type PublicBlogSettings,
} from "./blog-public";

function post(overrides: {
  id: string;
  slug: string;
  category?: { name: string; slug: string } | null;
  tags?: { name: string; slug: string }[];
  author?: { name: string; bio: string; photo: string } | null;
}): PublicBlogPost {
  const { id, slug } = overrides;
  const author = overrides.author === undefined
    ? { name: "Jane Doe", bio: "", photo: "" }
    : overrides.author;
  const category = overrides.category === undefined
    ? { name: "News", slug: "news" }
    : overrides.category;
  return {
    id, slug, published_at: "2026-01-01T00:00:00.000Z",
    featured: false, tags: overrides.tags ?? [{ name: "Tips", slug: "tips" }],
    publication: {
      version: 1, blocks: [],
      metadata: {
        title: slug.replaceAll("-", " "), subtitle: "", slug, excerpt: "", cover_image: "", cover_alt: "",
        thumbnail_image: "", thumbnail_alt: "", author, category, tags: [], featured: false,
        layout_override: null, seo_title: "", seo_description: "", canonical_url: "", noindex: false,
        reading_minutes: 1,
      },
    },
  };
}

describe("public blog routing and filtering", () => {
  it("parses nested post slugs and bounded search pagination", () => {
    expect(parseBlogRoute(["newsroom", "2026", "launch"], "/newsroom", {})).toEqual({
      kind: "post", slug: "2026/launch", page: 1, query: "",
    });
    expect(parseBlogRoute(["newsroom"], "/newsroom", { page: "4", q: "  winter  " })).toEqual({
      kind: "index", slug: "", page: 4, query: "winter",
    });
    expect(parseBlogRoute(["newsroom", "rss.xml"], "/newsroom", {})).toBeNull();
    expect(parseBlogRoute(["other"], "/newsroom", {})).toBeNull();
  });

  it("filters by tag, author, and text, then paginates without leaking matches", () => {
    const posts = [
      post({ id: "1", slug: "winter-guide", tags: [{ name: "Tips", slug: "tips" }] }),
      post({ id: "2", slug: "spring-update", tags: [{ name: "News", slug: "news" }], author: null }),
      post({ id: "3", slug: "winter-checklist", tags: [{ name: "Tips", slug: "tips" }] }),
    ];
    const byTag = selectBlogPosts(posts, { kind: "tag", slug: "tips", page: 1, query: "" }, 10);
    expect(byTag.posts.map(({ id }) => id)).toEqual(["1", "3"]);
    const byAuthor = selectBlogPosts(posts, { kind: "author", slug: "jane-doe", page: 1, query: "" }, 10);
    expect(byAuthor.posts.map(({ id }) => id)).toEqual(["1", "3"]);
    const search = selectBlogPosts(posts, { kind: "index", slug: "", page: 2, query: "winter" }, 1);
    expect(search.total).toBe(2);
    expect(search.posts.map(({ id }) => id)).toEqual(["3"]);
  });

  it("adds the RSS alternate and honors the tag noindex setting", () => {
    const site = {
      id: "site", account_id: "account", name: "Example", subdomain: "example",
      custom_domain: null, domain_verified: false, theme: {}, business: {}, seo: {},
    };
    const settings: PublicBlogSettings = {
      available: true, blog_path: "/journal", posts_per_page: 10, index_layout: "grid",
      default_post_layout: "classic", show_author: true, show_date: true, show_reading_time: true,
      show_share_links: true, show_in_menu: true, noindex_tags: true, cta_text: "",
      cta_button_text: "", cta_link: "", timezone: "UTC",
    };
    const metadata = blogMetadata(site, settings, { kind: "tag", slug: "tips", page: 1, query: "" });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toMatchObject({
      types: { "application/rss+xml": expect.stringContaining("/journal/rss.xml") },
    });
  });
});
