"use client";

import { linkContext } from "@/lib/links";
import { PagesManager } from "./pages-panel";
import { EditorIconPicker } from "./editor-icon-picker";
import { findBrokenLinks, type LinkIssue } from "@/lib/link-qa";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActionBar,
  Puck,
  blocksPlugin,
  createUsePuck,
  outlinePlugin,
  useGetPuck,
  type Data,
  type Overrides,
  type Plugin,
} from "@puckeditor/core";
import { ArrowLeft, ArrowUpRight, BookOpen, Bookmark, Check, Eye, FileText, Globe, Layers, LayoutGrid, Monitor, MoreHorizontal, Palette, PanelLeft, PanelRight, Plus, Redo2, Search, Sparkles, TriangleAlert, Undo2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { savePageMenuLabel } from "@/app/editor/[pageId]/actions";
import { defaultMenuLabel, pageMenuLinks, siteContacts } from "@/lib/page-navigation";
import { BusinessInfo } from "@/components/dashboard/business-info";
import type { Business } from "@/lib/business";
import { puckConfig } from "@/lib/puck/config";
import { editorConfig } from "@/lib/puck/editor-config";
import { canConvertToLayout, convertToLayout } from "@/lib/layout/convert";
import type { SiteTheme } from "@/lib/theme/presets";
import {
  findUnreplacedPlaceholders,
  type PlaceholderHit,
} from "@/lib/sections/placeholders";
import { EditorSiteContext } from "@/components/editor/image-upload-field";
import { ThemePanel } from "@/components/editor/theme-panel";
import {
  ROOT_ZONE,
  SectionLibraryContext,
  SectionLibraryPanel,
  useSectionLibrary,
  type SectionLibraryUi,
} from "@/components/editor/section-library";
import {
  AddSectionEndBar,
  CanvasInsertZones,
} from "@/components/editor/canvas-insert";
import { SaveDesignDialog } from "@/components/editor/save-design-dialog";
import { BlockThumbnail } from "@/components/editor/block-thumbnail";
import type { SectionCategory, SectionDesign } from "@/lib/sections/catalog";
import { SectionGhost } from "@/components/editor/section-ghost";
import { InteractionContext, useInteractions, type InteractionUi, type EditorPageLink, type InspectorTab } from "./interaction-context";
import type { DeviceId } from "@/lib/sections/design";
import { EditorInspector } from "./editor-inspector";
import { EditorInteractions, SelectionMenuButton } from "./editor-interactions";
import { useDraftPersistence } from "./use-draft-persistence";
import { EditorCommands, VersionHistory } from "./editor-commands";
import { EditorAiProvider } from "./editor-ai";
import { useEditorAi } from "./editor-ai-context";
import { SeoPanel } from "@/components/editor/seo-panel";
import type { SeoPageSummary } from "@/components/editor/seo-panel";
import type { SiteSeo } from "@/lib/seo";
import { canonicalUrl } from "@/lib/seo-public";

import { AskAiCanvas, AskAiProvider, useAskAi } from "./ask-ai";
import { isEmptyPage } from "@/lib/editor/empty-page";
import { blogManagerHref } from "@/lib/blog-navigation";
import type { BlogFeedMetadata } from "@/components/blocks/blog-posts";
import { defaultHeader, extractNavigation, headerSchema, type HeaderRoot } from "@/lib/header";
import { renderHeaderEditor } from "./header-editor";

type EditorUi = {
  pageId: string;
  siteId: string;
  siteName: string;
  siteSeo: SiteSeo;
  seoPages: SeoPageSummary[];
  pageTitle: string;
  publicUrl: string;
  previewUrl: string;
  openThemePanel: () => void;
  closeThemePanel: () => void;
  themePanelOpen: boolean;
  updateTheme: (theme: SiteTheme) => void;
  business: Business;
  theme: SiteTheme;
  initialHeader?: unknown;
  headersReady: boolean;
  updateBusiness: (business: Business) => void;
};

const EditorUiContext = createContext<EditorUi | null>(null);

function useEditorUi(): EditorUi {
  const context = useContext(EditorUiContext);
  if (!context) throw new Error("EditorUiContext missing");
  return context;
}

const usePuckStore = createUsePuck();
const PersistenceContext = createContext<ReturnType<typeof useDraftPersistence> | null>(null);

function usePersistence() {
  const persistence = useContext(PersistenceContext);
  if (!persistence) throw new Error("Editor persistence missing");
  return persistence;
}

function EditorRuntime({ children }: { children: React.ReactNode }) {
  const { pageId, theme, initialHeader, business, headersReady } = useEditorUi();
  const { pages } = useInteractions();
  const persistence = useDraftPersistence(pageId, theme, initialHeader);
  return <PersistenceContext.Provider value={persistence}><AskAiProvider pageId={pageId} theme={theme} persistence={persistence}
    metadata={{ siteMenu: { links: pageMenuLinks(pages.filter(page => !page.hide_from_menu && !page.ai_pending_build)), contacts: siteContacts(business) },
      siteLinks: linkContext(pages), pagePath: `/${pages.find(page => page.id === pageId)?.slug ?? ""}`, headersReady }}>
    <EditorPanelLayout />
    {children}
    <EditorThemePanel />
  </AskAiProvider></PersistenceContext.Provider>;
}

function EditorPanelLayout() {
  const getPuck = useGetPuck();
  const ui = usePuckStore((state) => state.appState.ui);
  const previousRightVisible = useRef(ui.rightSideBarVisible);
  useEffect(() => {
    const fitPanels = () => {
      const { appState, dispatch } = getPuck();
      const current = appState.ui;
      const inspectorOpened = current.rightSideBarVisible && !previousRightVisible.current;
      previousRightVisible.current = current.rightSideBarVisible;
      const maxWidth = Math.min(360, Math.max(240, window.innerWidth * 0.3));
      const widths = {
        leftSideBarWidth: Math.min(current.leftSideBarWidth ?? 280, maxWidth),
        rightSideBarWidth: Math.min(current.rightSideBarWidth ?? 300, maxWidth),
      };
      if (current.leftSideBarWidth !== widths.leftSideBarWidth || current.rightSideBarWidth !== widths.rightSideBarWidth ||
        (window.innerWidth < 1024 && current.leftSideBarVisible && current.rightSideBarVisible)) {
        dispatch({ type: "setUi", ui: {
          ...widths,
          ...(window.innerWidth < 1024 && current.leftSideBarVisible && current.rightSideBarVisible ?
            inspectorOpened ? { leftSideBarVisible: false } : { rightSideBarVisible: false } : {}),
        } });
      }
    };
    fitPanels();
    window.addEventListener("resize", fitPanels);
    return () => window.removeEventListener("resize", fitPanels);
  }, [getPuck, ui.leftSideBarWidth, ui.rightSideBarWidth, ui.leftSideBarVisible, ui.rightSideBarVisible]);
  return null;
}

function EditorHeader({ actions }: { actions: React.ReactNode }) {
  const { pageId, siteName } = useEditorUi();
  const { pages } = useInteractions();
  const persistence = usePersistence();
  const router = useRouter();
  const getPuck = useGetPuck();
  const ui = usePuckStore((state) => state.appState.ui);
  const history = usePuckStore((state) => state.history);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const update = () => element.closest<HTMLElement>(".platform-editor")?.style.setProperty("--editor-header-height", `${element.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const togglePanel = (side: "left" | "right") => {
    getPuck().dispatch({ type: "setUi", ui: side === "left" ? {
      leftSideBarVisible: !ui.leftSideBarVisible,
      ...(window.innerWidth < 1024 ? { rightSideBarVisible: false } : {}),
    } : {
      rightSideBarVisible: !ui.rightSideBarVisible,
      ...(window.innerWidth < 1024 ? { leftSideBarVisible: false } : {}),
    } });
  };
  return <header ref={header} className="editor-topbar" aria-label="Website editor">
    <div className="editor-topbar-location">
      <button type="button" className="editor-back-button" aria-label="Back to dashboard" title="Save changes and return to dashboard"
        disabled={persistence.busy !== null} onClick={async () => {
          if (!persistence.dirty || await persistence.save()) router.push("/dashboard");
        }}><ArrowLeft size={16} /><span>Dashboard</span></button>
      <div className="editor-page-location">
        <span className="editor-site-name" title={siteName}>{siteName}</span>
        <select aria-label="Switch page" value={pageId} disabled={persistence.busy !== null}
          onChange={async (event) => {
            const nextPageId = event.currentTarget.value;
            if (nextPageId !== pageId && (!persistence.dirty || await persistence.save())) router.push(`/editor/${nextPageId}`);
          }}>
          {pages.map((page) => <option key={page.id} value={page.id}>{page.nav_label ?? defaultMenuLabel(page.slug)}</option>)}
        </select>
      </div>
    </div>
    <div className="editor-topbar-tools" aria-label="Canvas tools">
      <button type="button" className="editor-icon-button" aria-label="Toggle library panel" title="Toggle library panel"
        aria-pressed={ui.leftSideBarVisible} onClick={() => togglePanel("left")}><PanelLeft size={17} /></button>
      <button type="button" className="editor-icon-button" aria-label="Toggle inspector" title="Toggle inspector"
        aria-pressed={ui.rightSideBarVisible} onClick={() => togglePanel("right")}><PanelRight size={17} /></button>
      <span className="editor-toolbar-separator" />
      <button type="button" className="editor-icon-button" aria-label="Undo" title="Undo (⌘/Ctrl+Z)" disabled={!history.hasPast || persistence.busy !== null}
        onClick={() => history.back()}><Undo2 size={17} /></button>
      <button type="button" className="editor-icon-button" aria-label="Redo" title="Redo (⌘/Ctrl+Shift+Z)" disabled={!history.hasFuture || persistence.busy !== null}
        onClick={() => history.forward()}><Redo2 size={17} /></button>
    </div>
    {actions}
  </header>;
}

function EditorThemePanel() {
  const { siteId, theme, themePanelOpen, closeThemePanel, updateTheme } = useEditorUi();
  const getPuck = useGetPuck();
  const persistence = usePersistence();
  const override = usePuckStore((state) => (state.appState.data.root.props as { __editorTheme?: SiteTheme } | undefined)?.__editorTheme);
  const [pending, setPending] = useState<{ base: SiteTheme; theme: SiteTheme }>();
  const displayed = override ? (pending?.base === override ? pending.theme : override) : theme;
  return <ThemePanel siteId={siteId} theme={displayed} open={themePanelOpen}
    onClose={() => { setPending(undefined); closeThemePanel(); }}
    onChange={(next) => override ? setPending({ base: override, theme: next }) : updateTheme(next)}
    saveOverride={override ? async (next) => {
      const base = getPuck().appState.data;
      return await persistence.applyAi(base, base, next, false)
        ? { status: "success", message: "Theme saved." }
        : { status: "error", message: "Could not save the theme. Check the editor status." };
    } : undefined} />;
}

function BuildEmptyPage({ canvas = false }: { canvas?: boolean }) {
  const empty = usePuckStore((state) => isEmptyPage(state.appState.data));
  const persistence = usePersistence();
  const { openLibrary } = useSectionLibrary();
  if (!empty) return canvas && persistence.buildNotes?.length ? <aside role="status" className="platform-ui m-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
    <p className="mb-2 font-semibold">AI draft review notes</p>
    <ul className="list-disc pl-4">{persistence.buildNotes.map((note) => <li key={note}>{note}</li>)}</ul>
  </aside> : null;
  return <section className={canvas ? "platform-ui editor-empty-page" : "mt-5 border-t border-zinc-200 pt-4"}>
    {canvas ? <><span className="editor-empty-icon"><LayoutGrid size={24} /></span><h2 className="text-lg font-semibold">Your next idea starts here</h2></> : null}
    <p className="mb-3 text-xs leading-relaxed text-zinc-500">Build this empty page using your saved business, site theme and page links. Review the draft before publishing.</p>
    <button type="button" className="platform-button platform-button-ai w-full" disabled={persistence.busy !== null}
      onClick={() => void persistence.buildEmptyPage()}><Sparkles size={14} />{persistence.busy ? "Building page…" : "Build this page with AI"}</button>
    <button type="button" className="platform-button mt-2 w-full" onClick={() => openLibrary(0)}><LayoutGrid size={14} />Browse designs</button>
    {canvas && persistence.error ? <p role="alert" className="mt-3 text-xs text-red-600">{persistence.error}</p> : null}
  </section>;
}

function PagesPanel() {
  const { pages, pageId } = useInteractions();
  const { siteId } = useEditorUi();
  const persistence = usePersistence();
  return <div className="editor-panel">
    <header className="editor-panel-header mb-4"><p className="platform-eyebrow mb-1">Site structure</p><h2 className="font-semibold">Pages</h2></header>
    <PagesManager siteId={siteId} pageId={pageId} pages={pages} persistence={persistence} />
    <MenuLabelSettings key={pageId} page={pages.find((page) => page.id === pageId)} />
    <BuildEmptyPage />
    {persistence.buildNotes?.length ? <ul role="status" className="mt-3 list-disc pl-4 text-xs text-amber-800">{persistence.buildNotes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
    {persistence.error ? <p role="alert" className="mt-3 text-xs text-red-600">{persistence.error}</p> : null}
  </div>;
}

function BlogPanel() {
  const { siteId, pageId } = useEditorUi();
  const persistence = usePersistence();
  const router = useRouter();
  const href = blogManagerHref(siteId, pageId);
  return <section className="editor-panel">
    <header className="editor-panel-header mb-4">
      <p className="platform-eyebrow mb-1">Publishing</p>
      <h2 className="font-semibold">Blog</h2>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">Write and manage posts for this site.</p>
    </header>
    <button type="button" className="platform-button platform-button-primary w-full" disabled={persistence.busy !== null} onClick={async () => {
      if (!persistence.dirty || await persistence.save()) router.push(href);
    }}>
      <BookOpen size={14} />Open blog manager
    </button>
    {persistence.error ? <p role="alert" className="mt-3 text-xs text-red-600">{persistence.error}</p> : null}
  </section>;
}

function DomainPanel() {
  const { siteId, pageId } = useEditorUi();
  const persistence = usePersistence();
  const router = useRouter();
  return <section className="editor-panel">
    <header className="editor-panel-header mb-4">
      <p className="platform-eyebrow mb-1">Publishing</p>
      <h2 className="font-semibold">Domain</h2>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">Connect or manage this website&apos;s domain in site settings.</p>
    </header>
    <button type="button" className="platform-button platform-button-primary w-full" disabled={persistence.busy !== null} onClick={async () => {
      if (!persistence.dirty || await persistence.save()) {
        router.push(`/dashboard/sites/${encodeURIComponent(siteId)}/domains?editorPage=${encodeURIComponent(pageId)}`);
      }
    }}><Globe size={14} />Open domain settings</button>
    {persistence.error ? <p role="alert" className="mt-3 text-xs text-red-600">{persistence.error}</p> : null}
  </section>;
}

function MenuLabelSettings({ page }: { page?: EditorPageLink }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState(page?.nav_label ?? defaultMenuLabel(page?.slug ?? ""));
  if (!page) return null;
  return <form className="mt-4 border-t border-zinc-200 pt-4" action={async (formData) => {
    const result = await savePageMenuLabel(page.id, String(formData.get("menuLabel") ?? ""), page.hide_from_menu ?? false);
    if (result.status !== "idle") setMessage(result.message);
    if (result.status === "success") router.refresh();
  }}>
    <h3 className="mb-2 text-sm font-semibold">This page in menus</h3>
    <label className="flex flex-col gap-1 text-xs">Menu label
      <input name="menuLabel" value={label} onChange={(event) => setLabel(event.currentTarget.value)} maxLength={40} required
        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
    </label>
    <button type="submit" className="platform-button mt-2">Save menu label</button>
    <p role="status" className="mt-1 text-xs">{message}</p>
  </form>;
}

/** New pages created with "Build with AI" open with ?build=ai; start the build once, then drop the flag. */
function AutoBuildPage() {
  const persistence = usePersistence();
  const empty = usePuckStore((state) => isEmptyPage(state.appState.data));
  const router = useRouter();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("build") !== "ai") return;
    started.current = true;
    url.searchParams.delete("build");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
    if (empty && persistence.busy === null) void persistence.buildEmptyPage();
  }, [empty, persistence, router]);
  return null;
}

function ThemeTool() {
  const { openThemePanel, siteId, business, updateBusiness } = useEditorUi();
  return <div className="editor-panel min-h-0 overflow-y-auto"><header className="editor-panel-header"><p className="platform-eyebrow mb-1">Visual identity</p><h2 className="font-semibold">Theme</h2>
    <p className="mt-2 text-xs leading-relaxed text-zinc-500">Update this site&apos;s colors, fonts and style.</p></header>
    <button type="button" className="platform-button platform-button-primary mt-4 w-full" onClick={openThemePanel}><Palette size={14} />Edit theme</button>
    <div className="mt-4"><BusinessInfo siteId={siteId} initialBusiness={business} onSave={updateBusiness} /></div>
  </div>;
}

function SeoTool() {
  const { siteId, siteSeo, pageId, seoPages, pageTitle, publicUrl } = useEditorUi();
  const persistence = usePersistence();
  const router = useRouter();
  return <SeoPanel siteId={siteId} pageId={pageId} siteSeo={siteSeo} pages={seoPages}
    pageTitle={pageTitle} publicUrl={publicUrl} isSwitching={persistence.busy !== null}
    switchError={persistence.error}
    onSelectPage={async (nextPageId) => {
      if (nextPageId === pageId || persistence.busy !== null) return;
      if (persistence.dirty && !(await persistence.save())) return;
      router.push(`/editor/${nextPageId}?panel=seo`, { scroll: false });
    }} />;
}

function AiTool() {
  const { openAdd } = useEditorAi();
  const askAi = useAskAi();
  const selection = usePuckStore((state) => state.appState.ui.itemSelector);
  const canEdit = usePuckStore((state) => state.getPermissions({ item: state.selectedItem }).edit !== false);
  const topLevel = selection && (!selection.zone || selection.zone === ROOT_ZONE) && canEdit;
  return <div className="editor-panel"><header className="editor-panel-header"><p className="platform-eyebrow mb-1">Creative assistant</p><h2 className="font-semibold">AI editing</h2>
    <p className="mt-2 text-xs leading-relaxed text-zinc-500">Preview changes before adding them to your draft.</p></header>
    <button type="button" disabled={!topLevel} onClick={() => askAi?.open()} className="platform-button mt-4 w-full">Edit selected section</button>
    <button type="button" onClick={openAdd} className="platform-button platform-button-ai mt-2 w-full"><Sparkles size={14} />Add a section with AI</button>
  </div>;
}

function AiCommandBar() {
  const { openAdd } = useEditorAi();
  return <aside aria-label="AI editing" className="platform-ui editor-ai-bar">
    <button type="button" onClick={openAdd} className="flex w-full items-center gap-3 text-left">
      <span className="rounded-xl bg-[#F1EFFF] p-2.5 text-[#4B3FE0]"><Sparkles size={16} strokeWidth={1.6} /></span>
      <span className="flex-1"><span className="block text-xs font-medium text-[#3D3C39]">Add a section with AI</span><span className="mt-0.5 block text-[11px] text-[#6B6A66]">Describe an idea. Preview the possibilities.</span></span>
      <ArrowUpRight size={16} className="text-[#6B6A66]" />
    </button>
  </aside>;
}

function EditorDrawer({ children }: { children: React.ReactNode }) {
  const { openLibrary } = useSectionLibrary();
  const count = usePuckStore((state) => state.appState.data.content.length);
  return <><div className="p-3"><button type="button" onClick={() => openLibrary(count)}
    className="w-full rounded-lg bg-[#121212] px-3 py-2 text-xs font-medium text-white">Browse section designs</button></div>{children}</>;
}

const editorPlugins: Plugin[] = [
  blocksPlugin({ label: "Add", icon: <EditorTool name="blocks" label="Add sections"><Plus size={18} /></EditorTool> }),
  outlinePlugin({ label: "Layers", icon: <EditorTool name="outline" label="Layers"><Layers size={18} /></EditorTool> }),
  { name: "pages", label: "Pages", icon: <EditorTool name="pages" label="Pages"><FileText size={18} /></EditorTool>, render: () => <PagesPanel /> },
  { name: "blog", label: "Blog", icon: <EditorTool name="blog" label="Blog"><BookOpen size={18} /></EditorTool>, render: () => <BlogPanel /> },
  { name: "domain", label: "Domain", icon: <EditorTool name="domain" label="Domain"><Globe size={18} /></EditorTool>, render: () => <DomainPanel /> },
  { name: "theme", label: "Theme", icon: <EditorTool name="theme" label="Theme"><Palette size={18} /></EditorTool>, render: () => <ThemeTool /> },
  { name: "ai", label: "AI", icon: <EditorTool name="ai" label="AI"><Sparkles size={18} /></EditorTool>, render: () => <AiTool /> },
  { name: "seo", label: "SEO", icon: <EditorTool name="seo" label="SEO"><Search size={18} /></EditorTool>, render: () => <SeoTool /> },
];

function EditorTool({ name, label, children }: { name: string; label: string; children: React.ReactNode }) {
  const active = usePuckStore((state) => state.appState.ui.plugin?.current === name && state.appState.ui.leftSideBarVisible);
  // Clicks bubble to Puck's rail item, preserving its plugin and collapse behavior.
  return <button type="button" className="editor-rail-button" title={label} aria-label={label} aria-pressed={active}>{children}</button>;
}

/** Labels for the placeholder warning, from the block config. */
const BLOCK_LABELS = Object.fromEntries(
  Object.entries(puckConfig.components).map(([type, component]) => [
    type,
    component.label ?? type,
  ]),
);

/** Header buttons: Save draft, Preview, Publish and the theme panel toggle. */
function HeaderActions() {
  const getPuck = useGetPuck();
  const askAi = useAskAi();
  const { siteId, previewUrl, openThemePanel } = useEditorUi();
  const persistence = usePersistence();
  const { busy } = persistence;
  const { pages, pageId } = useInteractions();
  const [placeholderHits, setPlaceholderHits] = useState<PlaceholderHit[] | null>(null);
  const [linkIssues, setLinkIssues] = useState<LinkIssue[]>([]);
  const run = persistence.save;

  // Publishing first checks for leftover [placeholder] text and broken links.
  const requestPublish = useCallback(() => {
    const { appState } = getPuck();
    const hits = findUnreplacedPlaceholders(appState.data, BLOCK_LABELS);
    const broken = findBrokenLinks(appState.data, { pages, currentPageId: pageId, labels: BLOCK_LABELS });
    if (hits.length > 0 || broken.length > 0) {
      setPlaceholderHits(hits);
      setLinkIssues(broken);
      return;
    }
    void run("publish");
  }, [getPuck, run, pages, pageId]);

  const selectSection = useCallback(
    (index: number) => {
      getPuck().dispatch({
        type: "setUi",
        ui: { itemSelector: { index, zone: ROOT_ZONE } },
      });
      setPlaceholderHits(null);
    },
    [getPuck],
  );

  const buttonClasses =
    "rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50";

  return (
    <div data-editor-header-actions className="editor-header-actions">
      <span role={persistence.error ? "alert" : "status"} title={persistence.error ?? undefined} className={`editor-save-status ${persistence.error ? "text-red-600" : "text-zinc-500"}`}>
        {!persistence.error && !busy && !persistence.dirty ? <Check size={12} className="shrink-0 text-[#6B6A66]" /> : null}
        {persistence.error ?? (busy ? busy === "publish" ? "Publishing..." : busy === "restore" ? "Restoring..." : "Saving..." : persistence.dirty ? "Unsaved changes" : "Saved")}
      </span>
      <button type="button" onClick={() => askAi?.open()} disabled={!!askAi?.proposal} aria-keyshortcuts="Control+K Meta+K"
        className="platform-button platform-button-ai"><Sparkles size={13} />Ask AI</button>
      <details className="editor-more" onKeyDown={(event) => {
        if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
      }} onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}>
        <summary className="editor-icon-button" aria-label="More editor actions" title="More editor actions"><MoreHorizontal size={19} /></summary>
        <div className="editor-more-content">
          <p className="platform-eyebrow">Editor actions</p>
          <VersionHistory persistence={persistence} siteId={siteId} />
          <button type="button" onClick={openThemePanel} className="platform-button"><Palette size={14} />Site theme</button>
          <EditorCommands persistence={persistence} onPublish={requestPublish} onTheme={openThemePanel} />
        </div>
      </details>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void run("save")}
        className="platform-button editor-save-button"
      >
        {busy === "save" ? "Saving…" : "Save draft"}
      </button>
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="platform-button editor-preview-button"
      >
        <Eye size={13} />Preview
      </a>
      <button
        type="button"
        disabled={busy !== null}
        onClick={requestPublish}
        className="platform-button platform-button-primary"
      >
        <ArrowUpRight size={14} />{busy === "publish" ? "Publishing…" : "Publish"}
      </button>
      {placeholderHits ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <TriangleAlert size={20} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  {placeholderHits.length ? "Some placeholder text hasn\u2019t been replaced yet" : "Some links need attention"}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {placeholderHits.length ? "Text in [brackets] or template placeholders is sample content \u2014 replace it with this business\u2019s real details before publishing." : "Visitors would reach a missing page or section. Pick a new link target before publishing."}
                </p>
              </div>
            </div>
            {linkIssues.length ? <div className="mt-4">
              <h3 className="text-xs font-semibold text-zinc-700">Broken links</h3>
              <ul className="mt-1.5 max-h-40 space-y-1.5 overflow-y-auto">
                {linkIssues.map((issue) => <li key={`${issue.index}-${issue.problem}`}>
                  <button type="button" onClick={() => selectSection(issue.index)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-left transition hover:border-zinc-300 hover:bg-zinc-50">
                    <span className="block text-sm font-medium text-zinc-800">{issue.label}<span className="font-normal text-zinc-400"> · section {issue.index + 1}</span></span>
                    <span className="mt-0.5 block text-xs text-red-600">{issue.problem}</span>
                  </button>
                </li>)}
              </ul>
            </div> : null}
            {placeholderHits.length && linkIssues.length ? <h3 className="mt-4 text-xs font-semibold text-zinc-700">Placeholder text</h3> : null}
            <ul className="mt-4 max-h-56 space-y-1.5 overflow-y-auto">
              {placeholderHits.map((hit) => (
                <li key={hit.index}>
                  <button
                    type="button"
                    onClick={() => selectSection(hit.index)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    <span className="block text-sm font-medium text-zinc-800">
                      {hit.label}
                      <span className="font-normal text-zinc-400"> · section {hit.index + 1}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-amber-600">
                      {hit.snippets.join("  ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPlaceholderHits(null)}
                className={`${buttonClasses} border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`}
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlaceholderHits(null);
                  void run("publish");
                }}
                className={`${buttonClasses} bg-[#121212] text-white hover:bg-zinc-700`}
              >
                Publish anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Action bar override: replicates Puck's default layout and adds, for
 * top-level sections, "Convert to custom layout" (designed blocks) and
 * the "Save as design" action.
 */
function EditorActionBar({
  label,
  children,
  parentAction,
  dragHandle,
}: {
  label?: string;
  children: React.ReactNode;
  parentAction: React.ReactNode;
  dragHandle?: React.ReactNode;
}) {
  const { openSaveDesign, isSuperAdmin } = useSectionLibrary();
  const askAi = useAskAi();
  const getPuck = useGetPuck();
  const zone = usePuckStore((s) => s.appState.ui.itemSelector?.zone);
  const selectedType = usePuckStore((s) => s.selectedItem?.type);
  const canEdit = usePuckStore((s) => s.getPermissions({ item: s.selectedItem }).edit !== false);
  const topLevel = !zone || zone === ROOT_ZONE;

  const convert = useCallback(() => {
    const { appState, selectedItem, config, dispatch } = getPuck();
    const selector = appState.ui.itemSelector;
    if (!selector || !selectedItem) return;
    const label = config.components[selectedItem.type]?.label ?? selectedItem.type;
    const ok = window.confirm(
      `Convert this ${label} into a custom layout? You'll be able to move, add and remove ` +
        "its elements freely. Undo restores the original section.",
    );
    if (!ok) return;
    const converted = convertToLayout(
      selectedItem as { type: string; props: Record<string, unknown> },
      (type) => config.components[type]?.defaultProps as Record<string, unknown> | undefined,
    );
    if (!converted) return;
    dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: ROOT_ZONE,
      data: converted,
    });
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: selector.index, zone: ROOT_ZONE } },
    });
  }, [getPuck]);

  return (
    <ActionBar>
      <ActionBar.Group>
        <ActionBar.Action label="Ask AI about this section" disabled={!topLevel || !canEdit} onClick={() => askAi?.open()}><Sparkles size={16} /></ActionBar.Action>
        {parentAction}
        {label ? <ActionBar.Label label={label} /> : null}
      </ActionBar.Group>
      <ActionBar.Group>
        {topLevel && canConvertToLayout(selectedType) ? (
          <ActionBar.Action label="Convert to custom layout" onClick={convert}>
            <LayoutGrid size={16} />
          </ActionBar.Action>
        ) : null}
        {isSuperAdmin && topLevel ? (
          <ActionBar.Action label="Save as design" onClick={openSaveDesign}>
            <Bookmark size={16} />
          </ActionBar.Action>
        ) : null}
        <SelectionMenuButton />
        {children}
      </ActionBar.Group>
      {dragHandle ? <ActionBar.Group>{dragHandle}</ActionBar.Group> : null}
    </ActionBar>
  );
}

function EditorDrawerItem({ children, name }: { children: React.ReactNode; name: string }) {
  const { theme } = useSectionLibrary();
  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <BlockThumbnail name={name} theme={theme} />
      {children}
    </div>
  );
}

export function PageEditor({
  page,
  site,
  initialData,
  previewUrl,
  isSuperAdmin,
  canManageDomains,
  userId,
  sitePages,
  seoPages,
  generationWarnings = [],
  business: initialBusiness,
  siteSeo,
  headersReady = true,
  blogFeed,
}: {
  page: { id: string; slug: string; title: string | null };
  site: { id: string; account_id: string; name: string | null; subdomain: string; custom_domain: string | null; domain_verified: boolean; theme: SiteTheme | null; draft_header?: unknown };
  initialData: Record<string, unknown>;
  previewUrl: string;
  isSuperAdmin: boolean;
  canManageDomains: boolean;
  userId: string;
  sitePages: EditorPageLink[];
  seoPages: SeoPageSummary[];
  generationWarnings?: string[];
  business: Business;
  siteSeo: SiteSeo;
  headersReady?: boolean;
  blogFeed?: BlogFeedMetadata;
}) {
  const searchParams = useSearchParams();
  const initialUi = useMemo(() => searchParams.get("panel") === "seo"
    ? { plugin: { current: "seo" }, leftSideBarVisible: true }
    : undefined, [searchParams]);
  const [showGenerationWarnings, setShowGenerationWarnings] = useState(true);
  const [theme, setTheme] = useState<SiteTheme>(site.theme ?? {});
  const [business, setBusiness] = useState(initialBusiness);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [library, setLibrary] = useState<SectionLibraryUi["library"]>({ open: false, index: 0 });
  const [preview, setPreview] = useState<SectionDesign | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const openLibrary = useCallback((index: number, category?: SectionCategory) => {
    setPreview(null);
    setLibrary({ open: true, index, category });
  }, []);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("content");
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [menu, setMenu] = useState<InteractionUi["menu"]>(null);
  const interactionUi = useMemo<InteractionUi>(() => ({
    pageId: page.id, accountId: site.account_id, userId, pages: sitePages,
    tab: inspectorTab, setTab: setInspectorTab, device, setDevice, menu, setMenu,
  }), [page.id, site.account_id, userId, sitePages, inspectorTab, device, menu]);
  const closeLibrary = useCallback(() => {
    setPreview(null);
    setLibrary((previous) => ({ ...previous, open: false }));
  }, []);

  const editorUi = useMemo<EditorUi>(
    () => ({
      pageId: page.id,
      seoPages,
      pageTitle: page.title || page.slug || "Home",
      publicUrl: canonicalUrl({
        subdomain: site.subdomain, custom_domain: site.custom_domain, domain_verified: site.domain_verified,
      }, page.slug),
      previewUrl,
      openThemePanel: () => setThemePanelOpen(true),
      closeThemePanel: () => setThemePanelOpen(false),
      themePanelOpen, updateTheme: setTheme,
      siteId: site.id,
      siteName: site.name ?? site.subdomain,
      siteSeo,
      business, updateBusiness: setBusiness, theme, initialHeader: site.draft_header, headersReady,
    }),
    [page.id, page.title, page.slug, previewUrl, site.id, site.name, site.subdomain, site.custom_domain, site.domain_verified, site.draft_header, siteSeo, seoPages, business, theme, themePanelOpen, headersReady],
  );

  const sectionLibraryUi = useMemo<SectionLibraryUi>(
    () => ({
      isSuperAdmin,
      theme,
      library,
      openLibrary,
      closeLibrary,
      preview,
      setPreview,
      saveDialogOpen,
      openSaveDesign: () => setSaveDialogOpen(true),
      closeSaveDesign: () => setSaveDialogOpen(false),
    }),
    [isSuperAdmin, theme, library, saveDialogOpen, openLibrary, closeLibrary, preview],
  );

  // Stable overrides (Puck requirement); components read React context.
  const overrides = useMemo<Partial<Overrides>>(
    () => ({
      header: ({ actions }) => <EditorHeader actions={actions} />,
      headerActions: () => <HeaderActions />,
      actionBar: (props) => <EditorActionBar {...props} />,
      drawerItem: (props) => <EditorDrawerItem {...props} />,
      drawer: ({ children }) => <EditorDrawer>{children}</EditorDrawer>,
      fields: (props) => <EditorInspector {...props} />,
      preview: ({ children }) => (
        <AskAiCanvas>
          {children}
          <BuildEmptyPage canvas />
          <AutoBuildPage />
          <CanvasInsertZones />
          <AddSectionEndBar />
          <SectionGhost />
          <AiCommandBar />
        </AskAiCanvas>
      ),
      puck: ({ children }) => (
        <EditorRuntime><EditorAiProvider>
          {children}
          <SectionLibraryPanel />
          <SaveDesignDialog />
          <EditorInteractions />
          <EditorIconPicker />
        </EditorAiProvider></EditorRuntime>
      ),
    }),
    [],
  );

  const config = useMemo(() => editorConfig(isSuperAdmin, headersReady), [isSuperAdmin, headersReady]);
  const plugins = useMemo(() => canManageDomains ? editorPlugins : editorPlugins.filter((plugin) => plugin.name !== "domain"), [canManageDomains]);

  const data = useMemo<Data>(() => {
    const raw = (initialData ?? {}) as Partial<Data>;
    const extracted = extractNavigation({ content: raw.content ?? [] });
    const rootProps: HeaderRoot = raw.root?.props ?? {};
    return {
      ...raw,
      content: headersReady && !rootProps.__legacyNavigation ? extracted.data.content : raw.content ?? [],
      root: {
        ...raw.root,
        props: { title: page.title ?? "", description: "", ...rootProps,
          ...(headersReady ? { __editorHeader: site.draft_header ? headerSchema.parse(site.draft_header) :
            extracted.header ?? defaultHeader(business.businessName || site.name || "", theme.logoUrl) } : {}),
        },
      },
    } as Data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EditorSiteContext.Provider value={{ siteId: site.id, query: business.businessType }}>
      <EditorUiContext.Provider value={editorUi}>
        <SectionLibraryContext.Provider value={sectionLibraryUi}>
          <InteractionContext.Provider value={interactionUi}>
          <div className="platform-editor editor-workspace">
            <section className="platform-ui editor-phone-notice" aria-label="Mobile website preview">
              <span className="editor-empty-icon"><Monitor size={28} /></span>
              <p className="platform-eyebrow">Website editor</p>
              <h1>Editing works best on a larger screen.</h1>
              <p>Open a tablet or computer to shape your site. You can still preview your last saved draft here.</p>
              <a href={previewUrl} target="_blank" rel="noreferrer" className="platform-button platform-button-primary"><Eye size={16} />Preview website</a>
              <a href="/dashboard" className="platform-button"><ArrowLeft size={16} />Back to dashboard</a>
            </section>
            <div className="editor-desktop-workspace">
            {!headersReady ? <p role="status" className="fixed bottom-12 right-4 z-[180] max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              {isSuperAdmin ? "Global headers are waiting for migration 0028. Apply it, then reload. Existing Navigation remains active." :
                "The new header editor is waiting for an agency update. Your existing navigation remains active."}
            </p> : null}
            {showGenerationWarnings && generationWarnings.length ? <aside role="status" className="fixed bottom-12 left-4 z-[100] max-h-56 w-[min(420px,90vw)] overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950 shadow-lg">
              <p className="font-semibold">AI draft review notes</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">{generationWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              <button type="button" className="mt-3 underline" onClick={() => setShowGenerationWarnings(false)}>Dismiss</button>
            </aside> : null}
            <Puck
              height="100%"
              dnd={{ enableDragHandle: true }}
              config={config}
              data={data}
              ui={initialUi}
              metadata={{ theme, siteMenu: { links: pageMenuLinks(sitePages.filter((page) => !page.hide_from_menu && !page.ai_pending_build)), contacts: siteContacts(business) }, siteLinks: linkContext(sitePages),
                renderHeader: headersReady ? renderHeaderEditor : undefined, pagePath: `/${page.slug}`, ...blogFeed,
              }}
              overrides={overrides}
              plugins={plugins}
              headerTitle={`${site.name ?? site.subdomain} / ${page.title || page.slug || "Home"}`}
              headerPath={page.slug ? `/${page.slug}` : "/"}
            />
            </div>
          </div>
          </InteractionContext.Provider>
        </SectionLibraryContext.Provider>
      </EditorUiContext.Provider>
    </EditorSiteContext.Provider>
  );
}
