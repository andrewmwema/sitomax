// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBusiness } from "@/lib/business";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  save: vi.fn(),
  dirty: false,
  panel: "seo",
  renderedPanel: "seo",
  data: { content: [], root: { props: {} } } as { content: unknown[]; root: { props: object } },
  build: vi.fn(),
  busy: null as string | null,
  ui: undefined as unknown,
  metadata: undefined as unknown,
  dispatch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  openLibrary: vi.fn(),
  header: false,
}));

function puckState() {
  return {
    appState: { data: mocks.data, ui: { leftSideBarVisible: true, rightSideBarVisible: false, leftSideBarWidth: 280, rightSideBarWidth: 300 } },
    history: { hasPast: true, hasFuture: false, back: mocks.back, forward: mocks.forward },
    dispatch: mocks.dispatch,
  };
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.panel ? { panel: mocks.panel } : {}),
}));
vi.mock("@puckeditor/core", () => ({
  createUsePuck: () => (selector: (value: unknown) => unknown) => selector(puckState()),
  useGetPuck: () => puckState,
  blocksPlugin: () => ({ name: "blocks" }),
  outlinePlugin: () => ({ name: "outline" }),
  Puck: ({ ui, metadata, overrides, plugins }: {
    ui: unknown;
    metadata: unknown;
    overrides: { puck: (props: { children: ReactNode }) => ReactNode; header: (props: { actions: ReactNode }) => ReactNode; headerActions: () => ReactNode };
    plugins: { name: string; render?: () => ReactNode }[];
  }) => {
    mocks.ui = ui;
    mocks.metadata = metadata;
    const Wrapper = overrides.puck;
    const Header = overrides.header;
    const Actions = overrides.headerActions;
    const Panel = plugins.find((plugin) => plugin.name === mocks.renderedPanel)!.render!;
    return <Wrapper>{mocks.header ? <Header actions={<Actions />} /> : null}<Panel /></Wrapper>;
  },
}));
vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));
vi.mock("@/lib/puck/editor-config", () => ({ editorConfig: () => ({}) }));
vi.mock("./use-draft-persistence", () => ({
  useDraftPersistence: () => ({ dirty: mocks.dirty, busy: mocks.busy, error: null, save: mocks.save,
    buildEmptyPage: mocks.build, buildNotes: [] }),
}));
vi.mock("./seo-panel", () => ({
  SeoPanel: ({ onSelectPage }: { onSelectPage: (id: string) => void }) =>
    <button onClick={() => onSelectPage("about-page")}>Select About</button>,
}));
vi.mock("./editor-ai", () => ({ EditorAiProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/app/editor/[pageId]/ai-actions", () => ({ suggestEditorEdits: vi.fn() }));
vi.mock("./section-library", () => ({
  ROOT_ZONE: "root:default-zone",
  SectionLibraryContext: { Provider: ({ children }: { children: ReactNode }) => children },
  SectionLibraryPanel: () => null,
  useSectionLibrary: () => ({ openLibrary: mocks.openLibrary }),
}));
vi.mock("./save-design-dialog", () => ({ SaveDesignDialog: () => null }));
vi.mock("./editor-interactions", () => ({ EditorInteractions: () => null }));
vi.mock("./theme-panel", () => ({ ThemePanel: () => null }));

import { PageEditor } from "./page-editor";

const props: ComponentProps<typeof PageEditor> = {
  page: { id: "home-page", slug: "", title: "Home" },
  site: {
    id: "site", account_id: "account", name: "Example", subdomain: "example",
    custom_domain: null, domain_verified: false, theme: {},
  },
  initialData: { root: { props: {} }, content: [] },
  previewUrl: "https://example.test",
  isSuperAdmin: false,
  userId: "user",
  sitePages: [],
  seoPages: [],
  business: emptyBusiness,
  siteSeo: { socialImage: "", googleAnalyticsId: "", metaPixelId: "", googleVerification: "", noindex: false },
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.panel = "seo";
  mocks.renderedPanel = "seo";
  mocks.data = { content: [], root: { props: {} } };
  mocks.busy = null;
  mocks.dirty = false;
  mocks.header = false;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  mocks.save.mockResolvedValue(true);
});

it("passes the site's published blog feed to the canvas", async () => {
  const blogFeed = { siteBlogPath: "https://example.test/blog", siteBlogPosts: [], siteBlogTimezone: "UTC" };
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PageEditor {...props} blogFeed={blogFeed} />));
    expect(mocks.metadata).toMatchObject(blogFeed);
  } finally {
    await act(async () => root.unmount());
  }
});

describe("empty-page AI entry point", () => {
  it("offers building the current empty page from Pages and disables repeated clicks while busy", async () => {
    mocks.renderedPanel = "pages";
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<PageEditor {...props} />));
    const build = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Build this page with AI"));
    expect(build).toBeDefined();
    await act(async () => build!.click());
    expect(mocks.build).toHaveBeenCalledOnce();
    mocks.busy = "save";
    await act(async () => root.render(<PageEditor {...props} />));
    expect(container.querySelector<HTMLButtonElement>(".platform-button-ai")!.disabled).toBe(true);
    await act(async () => root.unmount());
  });

  it("does not offer page generation when the canvas already contains content", async () => {
    mocks.renderedPanel = "pages";
    mocks.data = { content: [{ type: "Hero" }], root: { props: {} } };
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<PageEditor {...props} />));
    expect(container.textContent).not.toContain("Build this page with AI");
    await act(async () => root.unmount());
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("SEO page navigation", () => {
  it("opens SEO on arrival and keeps SEO selected when switching pages after saving", async () => {
    mocks.dirty = true;
    let finishSave!: (saved: boolean) => void;
    mocks.save.mockReturnValue(new Promise<boolean>((resolve) => { finishSave = resolve; }));
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<PageEditor {...props} />));
    expect(mocks.ui).toEqual({ plugin: { current: "seo" }, leftSideBarVisible: true });
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Select About")!.click());
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => finishSave(true));
    expect(mocks.push).toHaveBeenCalledWith("/editor/about-page?panel=seo", { scroll: false });
    await act(async () => root.unmount());
  });

  it("stays on the current page when saving fails", async () => {
    mocks.dirty = true;
    mocks.save.mockResolvedValue(false);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<PageEditor {...props} />));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Select About")!.click());
    expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

});

describe("editor navigation", () => {
    it("opens Blog Manager with the current page ID after saving changes", async () => {
      mocks.renderedPanel = "blog";
      mocks.dirty = true;
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} />));
      const open = [...container.querySelectorAll("button")].find((button) => button.textContent === "Open blog manager")!;
      await act(async () => open.click());
      expect(mocks.save).toHaveBeenCalledOnce();
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/sites/site/blog?editorPage=home-page");
      await act(async () => root.unmount());
    });

    it("shows a dashboard exit, saving changes first and staying put on save failure", async () => {
      mocks.header = true;
      mocks.dirty = true;
      let finishSave!: (saved: boolean) => void;
      mocks.save.mockReturnValueOnce(new Promise<boolean>((resolve) => { finishSave = resolve; }));
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} />));
      const exit = container.querySelector<HTMLButtonElement>('[aria-label="Back to dashboard"]')!;
      expect(exit.textContent).toContain("Dashboard");
      expect(container.querySelector('.editor-phone-notice a[href="/dashboard"]')?.textContent).toContain("Back to dashboard");
      await act(async () => exit.click());
      expect(mocks.save).toHaveBeenCalledOnce();
      expect(mocks.push).not.toHaveBeenCalled();
      await act(async () => finishSave(false));
      expect(mocks.push).not.toHaveBeenCalled();
      mocks.save.mockResolvedValueOnce(true);
      await act(async () => exit.click());
      expect(mocks.push).toHaveBeenCalledWith("/dashboard");
      mocks.push.mockClear();
      mocks.dirty = false;
      await act(async () => root.render(<PageEditor {...props} />));
      mocks.save.mockClear();
      await act(async () => exit.click());
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.push).toHaveBeenCalledWith("/dashboard");
      mocks.busy = "save";
      await act(async () => root.render(<PageEditor {...props} />));
      expect(exit.disabled).toBe(true);
      await act(async () => root.unmount());
    });

    it("uses the existing design library for an empty page", async () => {
      mocks.renderedPanel = "pages";
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} />));
      await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Browse designs")!.click());
      expect(mocks.openLibrary).toHaveBeenCalledWith(0);
      expect(container.querySelector('.editor-phone-notice a')?.getAttribute("href")).toBe(props.previewUrl);
      await act(async () => root.unmount());
    });

    it("saves before switching pages and preserves the current page when saving fails", async () => {
      mocks.header = true;
      mocks.dirty = true;
      mocks.save.mockResolvedValue(false);
      const container = document.createElement("div");
      const root = createRoot(container);
      const sitePages = [
        { id: "home-page", slug: "", title: "Home" },
        { id: "about-page", slug: "about", title: "About" },
      ];
      await act(async () => root.render(<PageEditor {...props} sitePages={sitePages} />));
      const select = container.querySelector<HTMLSelectElement>('[aria-label="Switch page"]')!;
      await act(async () => { select.value = "about-page"; select.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(mocks.save).toHaveBeenCalledOnce();
      expect(mocks.push).not.toHaveBeenCalled();
      mocks.save.mockResolvedValue(true);
      await act(async () => { select.value = "about-page"; select.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(mocks.push).toHaveBeenCalledWith("/editor/about-page");
      await act(async () => root.unmount());
    });

    it("connects history and tablet panel controls to Puck without modifying page data", async () => {
      mocks.header = true;
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} />));
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Undo"]')!.click());
      expect(mocks.back).toHaveBeenCalledOnce();
      expect(container.querySelector<HTMLButtonElement>('[aria-label="Redo"]')!.disabled).toBe(true);
      const width = window.innerWidth;
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Toggle inspector"]')!.click());
      expect(mocks.dispatch).toHaveBeenLastCalledWith({ type: "setUi", ui: { rightSideBarVisible: true, leftSideBarVisible: false } });
      expect(mocks.dispatch.mock.calls.every(([action]) => action.type === "setUi")).toBe(true);
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      await act(async () => root.unmount());
    });

    it("keeps save and publish wired to persistence and still requires placeholder review", async () => {
      mocks.header = true;
      mocks.data = { content: [{ type: "Hero", props: { id: "hero", heading: "[Add your headline]" } }], root: { props: {} } };
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} />));
      const button = (text: string) => [...container.querySelectorAll("button")].find((item) => !item.closest("dialog") && item.textContent === text)!;
      await act(async () => button("Save draft").click());
      expect(mocks.save).toHaveBeenLastCalledWith("save");
      mocks.save.mockClear();
      await act(async () => button("Publish").click());
      expect(mocks.save).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Some placeholder text");
      await act(async () => button("Publish anyway").click());
      expect(mocks.save).toHaveBeenLastCalledWith("publish");
      await act(async () => root.unmount());
    });
  it("keeps the normal editor default when no SEO panel was requested", async () => {
    mocks.panel = "";
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<PageEditor {...props} />));
    expect(mocks.ui).toBeUndefined();
    await act(async () => root.unmount());
  });
});
