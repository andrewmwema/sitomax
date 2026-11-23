// @vitest-environment jsdom
import { act, createContext, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BlogManager } from "./blog-manager";
import { PagesManager } from "./pages-manager";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/editor/media-picker", () => ({ MediaPicker: () => null }));
vi.mock("@/components/editor/image-upload-field", () => ({ EditorSiteContext: createContext(null) }));
vi.mock("./blog-import-panel", () => ({ BlogImportPanel: () => null }));
vi.mock("@/app/(dashboard)/dashboard/sites/[siteId]/blog/actions", () => ({}));
vi.mock("@/app/(dashboard)/dashboard/sites/[siteId]/actions", () => ({}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("renders each Pages-list edit as a native new-tab anchor", async () => {
  await act(async () => root.render(<PagesManager siteId="site" pages={[
    { id: "home", slug: "", title: "Home", sort_order: 0, published_at: null },
    { id: "about", slug: "about", title: "About", sort_order: 1, published_at: null },
  ]} />));
  const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/editor/"]')];
  expect(links.map((link) => link.getAttribute("href"))).toEqual(["/editor/home", "/editor/about"]);
  for (const link of links) {
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  }
});

it("opens blog titles, row/menu Edit actions and View live in new tabs", async () => {
  const props: ComponentProps<typeof BlogManager> = {
    siteId: "site", editorPageId: "home", subdomain: "example", siteName: "Example",
    timezone: "UTC", settingsTimezone: "UTC", canViewAnalytics: false,
    categories: [], authors: [], tags: [], altEntries: [],
    settings: { blog_path: "/blog", posts_per_page: 10, index_layout: "grid", default_post_layout: "classic",
      show_author: true, show_date: true, show_reading_time: true, show_share_links: true,
      show_in_menu: true, noindex_tags: true, cta_text: "", cta_button_text: "", cta_link: "" },
    posts: [{ id: "post", title: "Example post", slug: "example", excerpt: "", cover_image: "",
      created_at: "2026-01-01", updated_at: "2026-01-01", published_at: "2026-01-01", publish_at: null,
      status: "published", has_unpublished_changes: false, author_id: null, author_name: "",
      category_id: null, category_name: "", tag_names: [] }],
  };
  await act(async () => root.render(<BlogManager {...props} />));
  const edits = [...container.querySelectorAll<HTMLAnchorElement>('a[href="/dashboard/sites/site/blog/post?editorPage=home"]')];
  expect(edits.map((link) => link.textContent)).toEqual(["Example post", "Edit", "Edit"]);
  const live = [...container.querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent === "View live")!;
  const back = container.querySelector<HTMLAnchorElement>('a[href="/editor/home"]')!;
  for (const link of [...edits, live, back]) {
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  }
});
