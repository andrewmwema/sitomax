// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: {
    root: { props: { title: "About", seoTitle: "", description: "", socialImage: "", indexing: "inherit" } },
    content: [{ type: "Gallery", props: { id: "gallery-1", images: [{ url: "/photo.jpg", alt: "" }] } }],
  },
  dispatch: vi.fn(),
}));
vi.mock("@puckeditor/core", () => ({
  createUsePuck: () => (selector: (state: unknown) => unknown) => selector({ appState: { data: mocks.data } }),
  useGetPuck: () => () => ({ appState: { data: mocks.data }, dispatch: mocks.dispatch }),
}));
vi.mock("@/components/editor/image-upload-field", () => ({
  ImageUploadField: ({ allowUrl }: { allowUrl?: boolean }) => <button type="button" aria-label="Upload social image">{allowUrl ? "upload with URL" : "upload"}</button>,
}));
vi.mock("@/lib/editor/tree", () => ({
  editorTree: (data: typeof mocks.data) => [{ item: { props: { id: data.content[0].props.id } }, selector: { index: 0, zone: "root:default-zone" } }],
}));
import { SeoPanel } from "./seo-panel";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.data.root.props = { title: "About", seoTitle: "", description: "", socialImage: "", indexing: "inherit" };
  mocks.data.content = [{ type: "Gallery", props: { id: "gallery-1", images: [{ url: "/photo.jpg", alt: "" }] } }];
  mocks.dispatch.mockReset();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => callback(0));
});
afterEach(() => vi.unstubAllGlobals());

describe("editor SEO panel", () => {
  it("shows live fields, counters, previews and the site settings link", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<SeoPanel siteId="site-1" pageId="page-1" pageTitle="About" publicUrl="https://example.test/about" siteSeo={{
      socialImage: "", googleAnalyticsId: "", metaPixelId: "", googleVerification: "", noindex: false,
    }} />));
    expect(container.textContent).toContain("0/60 characters");
    expect(container.textContent).toContain("0/160 characters");
    expect(container.textContent).toContain("About");
    expect(container.textContent).toContain("https://example.test/about");
    expect(container.textContent).toContain("Business info, tracking codes and redirects.");
    expect(container.querySelector('a[href="/dashboard/sites/site-1/seo"]')?.getAttribute("target")).toBe("_blank");
    expect(container.querySelector('button[aria-label="Upload social image"]')?.textContent).toBe("upload");
    expect(container.textContent).not.toContain("Open page settings");
    await act(async () => root.unmount()); container.remove();
  });
  it("writes rail edits to Puck root data and links section findings to their block", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<SeoPanel siteId="site-1" pageId="page-1" pageTitle="About" publicUrl="https://example.test/about" siteSeo={{
      socialImage: "", googleAnalyticsId: "", metaPixelId: "", googleVerification: "", noindex: false,
    }} />));
    const title = container.querySelector<HTMLInputElement>("#seo-title")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Search title");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "setData" }));
    const dataAction = mocks.dispatch.mock.calls[0][0];
    expect(dataAction.data(mocks.data)).toMatchObject({ root: { props: { seoTitle: "Search title" } } });
    const fix = container.querySelector<HTMLButtonElement>('button[aria-label="Fix Images missing alt text"]')!;
    await act(async () => fix.click());
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: "setUi", ui: {
      itemSelector: { index: 0, zone: "root:default-zone" }, rightSideBarVisible: true,
    } });
    await act(async () => root.unmount()); container.remove();
  });
  it("lists pages with scores, warnings and current-page highlighting", async () => {
    const onSelectPage = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<SeoPanel siteId="site-1" pageId="page-1" pageTitle="About" publicUrl="https://example.test/about" onSelectPage={onSelectPage}
      pages={[
        { id: "page-1", title: "About", slug: "about", score: 86, hidden: false, hasPlaceholders: false },
        { id: "page-2", title: "Services", slug: "services", score: 57, hidden: true, hasPlaceholders: true },
      ]} siteSeo={{
        socialImage: "", googleAnalyticsId: "", metaPixelId: "", googleVerification: "", noindex: false,
      }} />));
    const current = container.querySelector<HTMLButtonElement>('button[aria-current="page"]');
    expect(current?.textContent).toContain("43%");
    expect(current?.disabled).toBe(true);
    const services = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Services"));
    expect(services?.textContent).toContain("/services");
    expect(services?.textContent).toContain("57%");
    expect(services?.querySelector("svg")?.getAttribute("aria-label")).toContain("Hidden from search engines");
    await act(async () => services?.click());
    expect(onSelectPage).toHaveBeenCalledWith("page-2");
    await act(async () => root.unmount()); container.remove();
  });
});
