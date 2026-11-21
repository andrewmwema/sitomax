import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Render } from "@puckeditor/core/rsc";
import { BlogPosts } from "@/components/blocks/blog-posts";

const mocks = vi.hoisted(() => ({ access: vi.fn(), blog: false, feed: false, table: vi.fn(), theme: {} as Record<string, unknown> }));
const post = { id: "post", slug: "example", published_at: "2026-11-20T12:00:00Z", tags: [], publication: { blocks: [], metadata: { title: "Example post" } } };
const feedData = () => ({ content: mocks.feed ? [{ type: "BlogPosts", props: { id: "feed" } }] : [] });
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (table: string) => {
    mocks.table(table);
    return { select: () => ({ eq: () => ({ maybeSingle: mocks.access }) }) };
  } }),
}));
vi.mock("@/lib/tenant", () => ({
  getSiteUrl: () => "https://example.com",
  getSiteByHost: async () => ({ id: "site", name: "Example", subdomain: "client", custom_domain: "example.com", domain_verified: true, theme: mocks.theme, business: {}, seo: { socialImage: "/share.jpg", googleVerification: "verify123" } }),
  getSitePage: async () => ({ id: "page", slug: "about", title: "About", seo: { title: "Search title", description: "Search description", noindex: true }, draft_data: feedData(), published_data: feedData() }),
  getTenantMenuPages: async () => [],
  getTenantLinkPages: async () => [],
}));
vi.mock("@/lib/blog-public", () => ({
  blogMetadata: () => ({}), blogPostUrl: () => "https://example.com/blog/example", blogPublicPath: (path: string, suffix?: string) => suffix ? `${path}/${suffix}` : path,
  getPublicBlogData: async () => ({ settings: { available: true, blog_path: "/news/journal", timezone: "UTC" }, posts: [post] }),
  getPublicBlogSettings: async () => ({ available: mocks.blog, blog_path: "/blog" }), getPublishedBlogPosts: async () => [post],
  parseBlogRoute: (slug: string[]) => slug.length > 1 ? { kind: "post", slug: "example" } : { kind: "index", page: 1 },
  selectBlogPosts: () => ({ posts: [post], total: 2, pages: 2 }),
}));
vi.mock("@/lib/puck/config", () => ({ puckConfig: {} }));
vi.mock("@puckeditor/core/rsc", () => ({ Render: () => null }));
vi.mock("@/components/tenant-font-hints", () => ({ TenantFontHints: () => null }));
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import TenantSitePage, { generateMetadata } from "./page";

beforeEach(() => {
  mocks.blog = false;
  mocks.feed = false;
  mocks.theme = {};
  mocks.table.mockClear();
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({ data: null, error: null });
});

async function hasBeacon(preview?: string) {
  const result = await TenantSitePage({
    params: Promise.resolve({ site: "client" }),
    searchParams: Promise.resolve(preview ? { preview } : {}),
  });
  return Children.toArray(result.props.children).some((child) => isValidElement(child) && child.type === AnalyticsBeacon);
}

describe("tenant blog feed links", () => {
  it.each(["1", undefined])("keeps the tenant context in feed links with preview=%s", async (preview) => {
    mocks.feed = true;
    mocks.access.mockResolvedValue({ data: { id: "page" }, error: null });
    const result = await TenantSitePage({
      params: Promise.resolve({ site: "client" }),
      searchParams: Promise.resolve({ preview }),
    });
    const render = Children.toArray(result.props.children).find((child) => isValidElement(child) && child.type === Render);
    if (!isValidElement<{ metadata: Record<string, unknown> }>(render) || !BlogPosts.defaultProps) {
      throw new Error("Missing blog feed render data");
    }
    const markup = renderToStaticMarkup(BlogPosts.render({
      ...BlogPosts.defaultProps,
      id: "feed",
      puck: { metadata: render.props.metadata, isEditing: false, dragRef: null, renderDropZone: () => null },
    }));
    const path = preview ? "/s/client/news/journal" : "/news/journal";
    const query = preview ? "?preview=1" : "";
    expect(markup).toContain(`href="${path}${query}"`);
    expect(markup).toContain(">View all posts</a>");
    expect(markup).toContain(`href="${path}/example${query}"`);
  });

  it("keeps the tenant and preview mode when navigating within the blog", async () => {
    mocks.blog = true;
    async function archiveMarkup(slug: string[]) {
      const result = await TenantSitePage({
        params: Promise.resolve({ site: "client", slug }), searchParams: Promise.resolve({ preview: "1" }),
      });
      const render = Children.toArray(result.props.children).find((child) => isValidElement(child) && child.type === Render);
      if (!isValidElement<{ data: { content: [{ props: Parameters<typeof BlogPosts.render>[0] }] } }>(render)) {
        throw new Error("Missing blog archive render data");
      }
      return renderToStaticMarkup(BlogPosts.render({
        ...render.props.data.content[0].props,
        id: "archive",
        puck: { metadata: {}, isEditing: false, dragRef: null, renderDropZone: () => null },
      }));
    }
    const index = await archiveMarkup(["blog"]);
    expect(index).toContain('href="/s/client/blog/example?preview=1"');
    expect(index).toContain('href="/s/client/blog?preview=1&amp;page=2"');
    expect(index).toContain('name="preview" value="1"');
    expect(await archiveMarkup(["blog", "example"])).toContain('href="/s/client/blog?preview=1"');
  });
});

describe("tenant analytics eligibility", () => {
  it("tracks public blog posts by ID, excluding previews, index pages, and site team visits", async () => {
    mocks.blog = true;
    async function beacon(slug: string[], preview?: string) {
      const result = await TenantSitePage({
        params: Promise.resolve({ site: "client", slug }), searchParams: Promise.resolve({ preview }),
      });
      return Children.toArray(result.props.children).find((child) => isValidElement(child) && child.type === AnalyticsBeacon);
    }
    expect(await beacon(["blog", "example"])).toMatchObject({ props: { blogPostId: "post" } });
    expect(mocks.table).toHaveBeenCalledWith("sites");
    expect(await beacon(["blog", "example"], "1")).toBeUndefined();
    expect(await beacon(["blog"])).toBeUndefined();
    mocks.access.mockResolvedValue({ data: { id: "site" }, error: null });
    expect(await beacon(["blog", "example"])).toBeUndefined();
  });

  it("tracks published pages only for visitors without page access", async () => {
    expect(await hasBeacon()).toBe(true);
    mocks.access.mockResolvedValue({ data: { id: "page" }, error: null });
    expect(await hasBeacon()).toBe(false);
  });

  describe("tenant metadata", () => {
    it("uses canonical, social, verification and noindex settings", async () => {
      mocks.theme = { faviconUrl: "/favicon.png", logoUrl: "/logo.png" };
      const metadata = await generateMetadata({ params: Promise.resolve({ site: "client", slug: ["about"] }), searchParams: Promise.resolve({}) });
      expect(metadata).toMatchObject({
        metadataBase: new URL("https://example.com/about"),
        title: "Search title", description: "Search description",
        alternates: { canonical: "https://example.com/about" },
        openGraph: { siteName: "Example", title: "Search title", images: ["https://example.com/share.jpg"] },
        twitter: { card: "summary_large_image" },
        icons: { icon: "https://example.com/favicon.png" },
        verification: { google: "verify123" }, robots: { index: false },
      });
      mocks.theme = {};
      await expect(generateMetadata({ params: Promise.resolve({ site: "client", slug: ["about"] }), searchParams: Promise.resolve({}) }))
        .resolves.toMatchObject({ icons: { icon: "/globe.svg" } });
    });
    it("does not render third-party tracking on preview requests", async () => {
      mocks.access.mockResolvedValue({ data: { id: "page" }, error: null });
      const result = await TenantSitePage({ params: Promise.resolve({ site: "client" }), searchParams: Promise.resolve({ preview: "1" }) });
      const children = Children.toArray(result.props.children);
      expect(children.some((child) => isValidElement(child) && typeof child.type === "function" && child.type.name === "TenantTracking")).toBe(false);
    });
  });
  it("never tracks preview URLs, even when preview access is denied", async () => {
    expect(await hasBeacon("1")).toBe(false);
    mocks.access.mockResolvedValue({ data: { id: "page" }, error: null });
    expect(await hasBeacon("1")).toBe(false);
  });
  it("fails closed when the access check fails", async () => {
    mocks.access.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await hasBeacon()).toBe(false);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
