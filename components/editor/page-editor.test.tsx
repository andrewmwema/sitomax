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
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.panel ? { panel: mocks.panel } : {}),
}));
vi.mock("@puckeditor/core", () => ({
  createUsePuck: () => (selector: (value: unknown) => unknown) => selector({ appState: { data: mocks.data } }),
  useGetPuck: vi.fn(),
  blocksPlugin: () => ({ name: "blocks" }),
  outlinePlugin: () => ({ name: "outline" }),
  Puck: ({ ui, overrides, plugins }: {
    ui: unknown;
    overrides: { puck: (props: { children: ReactNode }) => ReactNode };
    plugins: { name: string; render?: () => ReactNode }[];
  }) => {
    mocks.ui = ui;
    const Wrapper = overrides.puck;
    const Panel = plugins.find((plugin) => plugin.name === mocks.renderedPanel)!.render!;
    return <Wrapper><Panel /></Wrapper>;
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
  mocks.save.mockResolvedValue(true);
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
    await act(async () => container.querySelector("button")!.click());
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
    await act(async () => container.querySelector("button")!.click());
    expect(mocks.push).not.toHaveBeenCalled();
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
