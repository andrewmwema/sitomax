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
  plugins: [] as string[],
  publishState: vi.fn(),
  adopt: vi.fn(),
  applyAgent: vi.fn(),
  undoAgent: vi.fn(),
}));

function puckState() {
  return {
    appState: { data: mocks.data, ui: { leftSideBarVisible: true, rightSideBarVisible: false, leftSideBarWidth: 280, rightSideBarWidth: 300 } },
    history: { hasPast: true, hasFuture: false, back: mocks.back, forward: mocks.forward },
    dispatch: mocks.dispatch,
    selectedItem: null,
    getPermissions: () => ({ edit: true }),
  };
}

function sseResponse(events: object[]) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.close();
      },
    }),
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
    mocks.plugins = plugins.map((plugin) => plugin.name);
    const Wrapper = overrides.puck;
    const Header = overrides.header;
    const Actions = overrides.headerActions;
    const Panel = plugins.find((plugin) => plugin.name === mocks.renderedPanel)!.render!;
    return <Wrapper>{mocks.header ? <Header actions={<Actions />} /> : null}<Panel /></Wrapper>;
  },
}));
vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));
vi.mock("@/lib/puck/editor-config", () => ({ editorConfig: () => ({}) }));
vi.mock("@/app/editor/[pageId]/actions", () => ({
  getSitePublishState: (...args: unknown[]) => mocks.publishState(...args),
  publishSiteChanges: vi.fn(),
  savePageMenuLabel: vi.fn(),
}));
vi.mock("./use-draft-persistence", () => ({
  useDraftPersistence: () => ({ dirty: mocks.dirty, busy: mocks.busy, error: null, save: mocks.save,
    adopt: mocks.adopt, buildEmptyPage: mocks.build, buildNotes: [] }),
}));
vi.mock("./seo-panel", () => ({
  SeoPanel: ({ onSelectPage }: { onSelectPage: (id: string) => void }) =>
    <button onClick={() => onSelectPage("about-page")}>Select About</button>,
}));
vi.mock("./editor-ai", () => ({ EditorAiProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/app/editor/[pageId]/ai-actions", () => ({ editorAi: vi.fn() }));
vi.mock("@/app/editor/[pageId]/agent-actions", () => ({
  applyAgentChanges: (...args: unknown[]) => mocks.applyAgent(...args),
  undoAgentChanges: (...args: unknown[]) => mocks.undoAgent(...args),
  listAgentChanges: vi.fn().mockResolvedValue([]),
}));
vi.mock("./section-library", () => ({
  ROOT_ZONE: "root:default-zone",
  SectionLibraryContext: { Provider: ({ children }: { children: ReactNode }) => children },
  SectionLibraryPanel: () => null,
  useSectionLibrary: () => ({ openLibrary: mocks.openLibrary }),
}));
vi.mock("./save-design-dialog", () => ({ SaveDesignDialog: () => null }));
vi.mock("./editor-interactions", () => ({ EditorInteractions: () => null }));
vi.mock("./theme-panel", () => ({ ThemePanel: () => null }));
vi.mock("./editor-concurrency-notice", () => ({ EditorConcurrencyNotice: () => null }));

import { PageEditor } from "./page-editor";

const props: ComponentProps<typeof PageEditor> = {
  page: { id: "home-page", slug: "", title: "Home", draftVersion: "00000000-0000-4000-8000-000000000001" },
  site: {
    id: "site", account_id: "account", name: "Example", subdomain: "example",
    custom_domain: null, domain_verified: false, theme: {},
  },
  initialData: { root: { props: {} }, content: [] },
  previewUrl: "https://example.test",
  isSuperAdmin: false,
  canManageDomains: true,
  userId: "user",
  sitePages: [],
  seoPages: [],
  pendingSiteChanges: { headerChanged: false, themeChanged: false, blogSettingsChanged: false },
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
  mocks.publishState.mockResolvedValue({ status: "success", data: {
    pages: [{ id: "home-page", slug: "", title: "Home", published: true, hasChanges: true, footerChanged: false }],
    headerChanged: false, themeChanged: false, blogSettingsChanged: false, liveUrl: "https://example.test",
  } });
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
    it("opens and closes the AI chat from the top bar and Ctrl+J", async () => {
      mocks.header = true;
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ threads: [], messages: [], latestRun: null }),
      }));
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} />));
      const toggle = container.querySelector<HTMLButtonElement>(".editor-agent-toggle")!;
      await act(async () => toggle.click());
      expect(container.querySelector('[aria-label="AI site agent"]')).not.toBeNull();
      await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true })));
      expect(container.querySelector('[aria-label="AI site agent"]')).toBeNull();
      await act(async () => root.unmount());
    });

    it("streams agent steps, plan approval, and clickable ask-user options", async () => {
      mocks.header = true;
      const thread = { id: "thread-1", title: "Improve the site", updated_at: "2026-01-01T00:00:00Z" };
      const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
        if (init?.method !== "POST") return {
          ok: true, json: async () => ({ threads: [thread], messages: [], latestRun: null }),
        };
        const body = JSON.parse(String(init.body)) as { action: string };
        if (body.action === "start") return sseResponse([
          { type: "run", threadId: thread.id, runId: "run-1" },
          { type: "text", text: "I'll review the site first." },
          { type: "step", callId: "step-1", name: "get_site_overview", input: {}, status: "running" },
          { type: "tool", callId: "step-1", name: "get_site_overview", input: {}, changes: 0 },
          { type: "plan", callId: "plan-1", steps: ["Update the theme", "Add an FAQ"], rationale: "Improve clarity." },
          { type: "awaiting_approval" },
        ]);
        if (body.action === "approve_plan") return sseResponse([
          { type: "run", threadId: thread.id, runId: "run-1" },
          { type: "question", callId: "question-1", question: "Which accent should I use?", options: ["Blue", "Green"] },
          { type: "awaiting_input" },
        ]);
        return sseResponse([
          { type: "run", threadId: thread.id, runId: "run-1" },
          { type: "text", text: "I'll use green." },
          { type: "done", threadId: thread.id, runId: "run-1", status: "completed", summary: "I'll use green." },
        ]);
      });
      vi.stubGlobal("fetch", fetchMock);
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} />));
      await act(async () => container.querySelector<HTMLButtonElement>(".editor-agent-toggle")!.click());
      const suggestion = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.trim() === "Make the site feel more premium");
      await act(async () => suggestion!.click());
      await vi.waitFor(() => expect(container.textContent).toContain("Proposed plan"));
      expect(container.textContent).toContain("Reading the site overview");
      await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Approve")!.click());
      await vi.waitFor(() => expect(container.textContent).toContain("Which accent should I use?"));
      await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Green")!.click());
      await vi.waitFor(() => expect(container.textContent).toContain("I'll use green."));
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(3);
      await act(async () => root.unmount());
    });

    it("applies kept changes to drafts, then undoes them site-wide and links the skipped items", async () => {
      mocks.header = true;
      mocks.dirty = true;
      mocks.adopt.mockResolvedValue(true);
      vi.stubGlobal("confirm", () => true);
      const thread = { id: "11111111-1111-4111-8111-111111111111", title: "Make the site premium", updated_at: "2026-01-01T00:00:00Z" };
      const runId = "22222222-2222-4222-8222-222222222222";
      const aboutId = "33333333-3333-4333-8333-333333333333";
      const value = (style: string) => ({ present: true, value: style });
      const review = {
        changes: ["theme", "about"].map((id) => ({ id, kind: "theme", label: `Update ${id}`,
          patches: [{ path: ["theme", id], before: value("classic"), after: value("modern") }] })),
        baseline: { theme: { theme: "classic", about: "classic" }, header: {}, footer: {}, pages: [] },
        working: { theme: { theme: "modern", about: "modern" }, header: {}, footer: {}, pages: [] },
      };
      const applied = {
        id: "44444444-4444-4444-8444-444444444444", run_id: runId, summary: thread.title, change_count: 1,
        applied_by_name: "Olive Owner", applied_at: "2026-01-02T00:00:00Z",
        undone_by_name: null, undone_at: null, undo_result: null, can_undo: true,
      };
      const editor = { data: { root: { props: { title: "Home" } }, content: [] }, version: "v2", theme: { style: "modern" }, draftHeader: null };
      mocks.applyAgent.mockResolvedValue({ status: "success", applied, notes: [], editor,
        dropped: [{ id: "about", label: "Update about", reason: "This content was edited after the AI prepared the change." }] });
      mocks.undoAgent.mockResolvedValue({ status: "success", editor: null, applied: {
        ...applied, can_undo: false, undone_by_name: "Eddie Editor", undone_at: "2026-01-03T00:00:00Z",
        undo_result: { undone: 1, skipped: 1, undone_items: ["theme"], skipped_items: [
          { key: `page:${aboutId}`, kind: "page", target_id: aboutId, label: "About", reason: "edited" }] },
      } });
      vi.stubGlobal("fetch", vi.fn(async (input: string) => ({ ok: true, json: async () => ({
        threads: [thread], messages: [],
        latestRun: input.includes("threadId") ? { id: runId, status: "completed", review, applied: null } : null,
      }) })));
      const container = document.createElement("div");
      const root = createRoot(container);
      const button = (text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === text)!;
      await act(async () => root.render(<PageEditor {...props} />));
      await act(async () => container.querySelector<HTMLButtonElement>(".editor-agent-toggle")!.click());
      await act(async () => button(thread.title).click());
      await act(async () => button("Undo").click());
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Keep Update about"]')!.click());
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Undo Update theme"]')!.click());
      await act(async () => button("Apply 1 change to drafts").click());

      expect(mocks.save).toHaveBeenCalledTimes(1);
      expect(mocks.applyAgent).toHaveBeenCalledWith({ siteId: "site", threadId: thread.id, runId, pageId: "home-page", undone: ["theme"] });
      expect(mocks.adopt).toHaveBeenCalledWith(expect.objectContaining({ version: "v2", theme: { style: "modern" }, draftHeader: null }));
      expect(container.querySelector('[aria-label="Review AI changes"]')).toBeNull();
      expect(container.textContent).toContain("AI: Make the site premium");
      expect(container.textContent).toContain("Not applied (1)");

      await act(async () => button("Undo these changes").click());
      expect(mocks.undoAgent).toHaveBeenCalledWith({ siteId: "site", applyId: applied.id, pageId: "home-page" });
      expect(container.textContent).toContain("Undone 1 change · Skipped 1 (edited since)");
      expect(container.querySelector(`a[href="/editor/${aboutId}"]`)?.textContent).toBe("About");
      expect(button("Undo these changes")).toBeUndefined();
      await act(async () => root.unmount());
    });

    it("routes the old Ask AI entry points to the agent with a prefilled request and insert position", async () => {
      mocks.header = true;
      mocks.renderedPanel = "ai";
      mocks.data = { content: [{ type: "Hero", props: { id: "hero" } }, { type: "Footer", props: { id: "footer" } }], root: { props: {} } };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true, json: async () => ({ threads: [], messages: [], latestRun: null }),
      }));
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} />));
      expect([...container.querySelectorAll("button")].some((item) => item.textContent?.trim() === "Ask AI")).toBe(false);
      await act(async () => [...container.querySelectorAll("button")]
        .find((item) => item.textContent?.trim() === "Add a section with AI")!.click());
      const prompt = container.querySelector<HTMLTextAreaElement>('[aria-label="Message the AI site agent"]')!;
      expect(prompt.value).toBe("Add a section here: ");
      expect(container.textContent).toContain("@Insert at position 2");
      await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })));
      expect(container.querySelector('[aria-label="AI site agent"]')).toBeNull();
      await act(async () => root.unmount());
    });

    it("opens domain settings from the header after saving and stays put if saving fails", async () => {
      mocks.header = true;
      mocks.dirty = true;
      mocks.save.mockResolvedValueOnce(false);
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} />));
      const button = container.querySelector<HTMLButtonElement>('.editor-topbar [aria-label="Open domain settings"]')!;
      expect(button.textContent).toContain("Domain");
      await act(async () => button.click());
      expect(mocks.save).toHaveBeenCalledOnce();
      expect(mocks.push).not.toHaveBeenCalled();
      mocks.save.mockResolvedValueOnce(true);
      await act(async () => button.click());
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/sites/site/domains?editorPage=home-page");
      mocks.busy = "save";
      await act(async () => root.render(<PageEditor {...props} />));
      expect(button.disabled).toBe(true);
      await act(async () => root.render(<PageEditor {...props} canManageDomains={false} />));
      expect(container.querySelector('.editor-topbar [aria-label="Open domain settings"]')).toBeNull();
      await act(async () => root.unmount());
    });

    it("opens domain settings only after a successful draft save", async () => {
      mocks.renderedPanel = "domain";
      mocks.dirty = true;
      let finishSave!: (saved: boolean) => void;
      mocks.save.mockReturnValueOnce(new Promise<boolean>((resolve) => { finishSave = resolve; }));
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} />));
      const open = [...container.querySelectorAll("button")].find((button) => button.textContent === "Open domain settings")!;
      await act(async () => open.click());
      expect(mocks.save).toHaveBeenCalledOnce();
      expect(mocks.push).not.toHaveBeenCalled();
      await act(async () => finishSave(false));
      expect(mocks.push).not.toHaveBeenCalled();
      mocks.save.mockResolvedValueOnce(true);
      await act(async () => open.click());
      expect(mocks.push).toHaveBeenCalledWith("/dashboard/sites/site/domains?editorPage=home-page");
      mocks.push.mockClear();
      mocks.dirty = false;
      mocks.save.mockClear();
      await act(async () => root.render(<PageEditor {...props} />));
      await act(async () => open.click());
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.push).toHaveBeenCalledOnce();
      mocks.busy = "save";
      await act(async () => root.render(<PageEditor {...props} />));
      expect(open.disabled).toBe(true);
      await act(async () => root.unmount());
    });

    it("does not offer the domain tool to users without domain-management access", async () => {
      const container = document.createElement("div");
      const root = createRoot(container);
      await act(async () => root.render(<PageEditor {...props} canManageDomains={false} />));
      expect(mocks.plugins).not.toContain("domain");
      await act(async () => root.unmount());
    });

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
      const exit = container.querySelector<HTMLAnchorElement>('[aria-label="Back to dashboard"]')!;
      expect(exit.textContent).toContain("Dashboard");
      expect(exit.getAttribute("href")).toBe("/dashboard");
      expect(exit.getAttribute("target")).toBeNull();
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
      expect(exit.getAttribute("href")).toBe("/dashboard");
      expect(exit.getAttribute("target")).toBeNull();
      mocks.busy = "save";
      await act(async () => root.render(<PageEditor {...props} />));
      expect(exit.getAttribute("aria-disabled")).toBe("true");
      const busyClick = new MouseEvent("click", { bubbles: true, cancelable: true });
      await act(async () => exit.dispatchEvent(busyClick));
      expect(busyClick.defaultPrevented).toBe(true);
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
      expect(mocks.publishState).toHaveBeenCalledWith("site");
      expect(container.textContent).toContain("Publish changes");
      expect(container.textContent).toContain("Publish this page");
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
