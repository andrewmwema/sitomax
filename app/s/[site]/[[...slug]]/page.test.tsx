import { Children, isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), blog: false, table: vi.fn() }));
const post = { id: "post", slug: "example", tags: [], publication: { metadata: { title: "Example post" } } };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (table: string) => {
    mocks.table(table);
    return { select: () => ({ eq: () => ({ maybeSingle: mocks.access }) }) };
  } }),
}));
vi.mock("@/lib/tenant", () => ({
  getSiteUrl: () => "https://example.com",
  getSiteByHost: async () => ({ id: "site", name: "Example", subdomain: "client", custom_domain: "example.com", domain_verified: true, theme: {}, business: {}, seo: { socialImage: "/share.jpg", googleVerification: "verify123" } }),
  getSitePage: async () => ({ id: "page", slug: "about", title: "About", seo: { title: "Search title", description: "Search description", noindex: true }, draft_data: { content: [] }, published_data: { content: [] } }),
  getTenantMenuPages: async () => [],
  getTenantLinkPages: async () => [],
}));
vi.mock("@/lib/blog-public", () => ({
  blogMetadata: () => ({}), blogPostUrl: () => "https://example.com/blog/example", blogPublicPath: () => "/blog",
  getPublicBlogData: async () => ({ settings: { available: false }, posts: [] }),
  getPublicBlogSettings: async () => ({ available: mocks.blog, blog_path: "/blog" }), getPublishedBlogPosts: async () => [post],
  parseBlogRoute: (slug: string[]) => slug.length > 1 ? { kind: "post", slug: "example" } : { kind: "index", page: 1 },
  selectBlogPosts: () => ({ posts: [], total: 0, pages: 1 }),
}));
vi.mock("@/lib/puck/config", () => ({ puckConfig: {} }));
vi.mock("@puckeditor/core/rsc", () => ({ Render: () => null }));
vi.mock("@/components/tenant-font-hints", () => ({ TenantFontHints: () => null }));
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import TenantSitePage, { generateMetadata } from "./page";

beforeEach(() => {
  mocks.blog = false;
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
      const metadata = await generateMetadata({ params: Promise.resolve({ site: "client", slug: ["about"] }), searchParams: Promise.resolve({}) });
      expect(metadata).toMatchObject({
        metadataBase: new URL("https://example.com/about"),
        title: "Search title", description: "Search description",
        alternates: { canonical: "https://example.com/about" },
        openGraph: { siteName: "Example", title: "Search title", images: ["https://example.com/share.jpg"] },
        twitter: { card: "summary_large_image" },
        icons: { icon: "/globe.svg" },
        verification: { google: "verify123" }, robots: { index: false },
      });
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
