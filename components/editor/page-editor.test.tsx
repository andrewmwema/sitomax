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
  ui: undefined as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.panel ? { panel: mocks.panel } : {}),
}));
vi.mock("@puckeditor/core", () => ({
  createUsePuck: () => vi.fn(),
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
    const Seo = plugins.find((plugin) => plugin.name === "seo")!.render!;
    return <Wrapper><Seo /></Wrapper>;
  },
}));
vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));
vi.mock("@/lib/puck/editor-config", () => ({ editorConfig: () => ({}) }));
vi.mock("./use-draft-persistence", () => ({
  useDraftPersistence: () => ({ dirty: mocks.dirty, busy: null, error: null, save: mocks.save }),
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
  mocks.dirty = false;
  mocks.save.mockResolvedValue(true);
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
