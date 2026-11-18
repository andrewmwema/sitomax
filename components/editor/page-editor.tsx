"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
import { ArrowLeft, ArrowUpRight, Bookmark, Check, Eye, FileText, Layers, LayoutGrid, Palette, Plus, Search, Sparkles, TriangleAlert } from "lucide-react";
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

type EditorUi = {
  pageId: string;
  siteId: string;
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
  const { pageId, theme } = useEditorUi();
  const persistence = useDraftPersistence(pageId, theme);
  return <PersistenceContext.Provider value={persistence}><AskAiProvider pageId={pageId} theme={theme} persistence={persistence}>
    {children}
    <EditorThemePanel />
  </AskAiProvider></PersistenceContext.Provider>;
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
  if (!empty) return canvas && persistence.buildNotes?.length ? <aside role="status" className="platform-ui m-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
    <p className="mb-2 font-semibold">AI draft review notes</p>
    <ul className="list-disc pl-4">{persistence.buildNotes.map((note) => <li key={note}>{note}</li>)}</ul>
  </aside> : null;
  return <section className={canvas ? "platform-ui mx-auto my-8 max-w-sm rounded-xl border border-zinc-200 bg-white p-5 text-center" : "mt-5 border-t border-zinc-200 pt-4"}>
    <p className="mb-3 text-xs leading-relaxed text-zinc-500">Build this empty page using your saved business, site theme and page links. Review the draft before publishing.</p>
    <button type="button" className="platform-button platform-button-ai w-full" disabled={persistence.busy !== null}
      onClick={() => void persistence.buildEmptyPage()}><Sparkles size={14} />{persistence.busy ? "Building page…" : "Build this page with AI"}</button>
    {canvas && persistence.error ? <p role="alert" className="mt-3 text-xs text-red-600">{persistence.error}</p> : null}
  </section>;
}

function PagesPanel() {
  const { pages, pageId } = useInteractions();
  const persistence = usePersistence();
  const router = useRouter();
  return <div className="editor-panel">
    <header className="editor-panel-header mb-4"><p className="platform-eyebrow mb-1">Site structure</p><h2 className="font-semibold">Pages</h2></header>
    <div className="flex flex-col gap-1">
      {pages.map((page) => <button key={page.id} type="button" aria-current={page.id === pageId ? "page" : undefined}
        disabled={page.id === pageId || persistence.busy !== null}
        className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F7F7F5] disabled:opacity-60"
        onClick={async () => {
          if (!persistence.dirty || await persistence.save()) router.push(`/editor/${page.id}`);
        }}>{page.nav_label ?? defaultMenuLabel(page.slug)}</button>)}
    </div>
    <MenuLabelSettings key={pageId} page={pages.find((page) => page.id === pageId)} />
    <BuildEmptyPage />
    {persistence.buildNotes?.length ? <ul role="status" className="mt-3 list-disc pl-4 text-xs text-amber-800">{persistence.buildNotes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
    {persistence.error ? <p role="alert" className="mt-3 text-xs text-red-600">{persistence.error}</p> : null}
  </div>;
}

function MenuLabelSettings({ page }: { page?: EditorPageLink }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState(page?.nav_label ?? defaultMenuLabel(page?.slug ?? ""));
  const [hidden, setHidden] = useState(page?.hide_from_menu ?? false);
  if (!page) return null;
  return <form className="mt-4 border-t border-zinc-200 pt-4" action={async (formData) => {
    const result = await savePageMenuLabel(page.id, String(formData.get("menuLabel") ?? ""), hidden);
    if (result.status !== "idle") setMessage(result.message);
    if (result.status === "success") router.refresh();
  }}>
    <h3 className="mb-2 text-sm font-semibold">Page settings</h3>
    <label className="flex flex-col gap-1 text-xs">Menu label
      <input name="menuLabel" value={label} onChange={(event) => setLabel(event.currentTarget.value)} maxLength={40} required
        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" />
    </label>
    <label className="mt-2 flex items-center gap-2 text-xs">
      <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.currentTarget.checked)} />Hide from site menus
    </label>
    <button type="submit" className="platform-button mt-2">Save menu settings</button>
    <p role="status" className="mt-1 text-xs">{message}</p>
  </form>;
}

function ThemeTool() {
  const { openThemePanel, siteId, business } = useEditorUi();
  return <div className="editor-panel min-h-0 overflow-y-auto"><header className="editor-panel-header"><p className="platform-eyebrow mb-1">Visual identity</p><h2 className="font-semibold">Theme</h2>
    <p className="mt-2 text-xs leading-relaxed text-zinc-500">Update this site&apos;s colors, fonts and style.</p></header>
    <button type="button" className="platform-button platform-button-primary mt-4 w-full" onClick={openThemePanel}><Palette size={14} />Edit theme</button>
    <div className="mt-4"><BusinessInfo siteId={siteId} initialBusiness={business} /></div>
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
  blocksPlugin({ label: "Add", icon: <Plus size={18} /> }),
  outlinePlugin({ label: "Layers", icon: <Layers size={18} /> }),
  { name: "pages", label: "Pages", icon: <FileText size={18} />, render: () => <PagesPanel /> },
  { name: "theme", label: "Theme", icon: <Palette size={18} />, render: () => <ThemeTool /> },
  { name: "ai", label: "AI", icon: <Sparkles size={18} />, render: () => <AiTool /> },
  { name: "seo", label: "SEO", icon: <Search size={18} />, render: () => <SeoTool /> },
];

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
  const router = useRouter();
  const { busy } = persistence;
  const [placeholderHits, setPlaceholderHits] = useState<PlaceholderHit[] | null>(null);
  const run = persistence.save;

  // Publishing first checks for leftover [placeholder] text in designs.
  const requestPublish = useCallback(() => {
    const { appState } = getPuck();
    const hits = findUnreplacedPlaceholders(appState.data, BLOCK_LABELS);
    if (hits.length > 0) {
      setPlaceholderHits(hits);
      return;
    }
    void run("publish");
  }, [getPuck, run]);

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
    <div data-editor-header-actions className="flex flex-wrap items-center justify-end gap-1.5">
      <button type="button" disabled={busy !== null} onClick={async () => {
        if (!persistence.dirty || await persistence.save()) router.push("/dashboard");
      }} className="platform-button"><ArrowLeft size={13} />Dashboard</button>
      <span role={persistence.error ? "alert" : "status"} className={`mx-1.5 inline-flex max-w-64 items-center gap-1.5 text-[11px] ${persistence.error ? "text-red-600" : "text-zinc-500"}`}>
        {!persistence.error && !busy && !persistence.dirty ? <Check size={12} className="shrink-0 text-[#6B6A66]" /> : null}
        {persistence.error ?? (busy ? busy === "publish" ? "Publishing..." : busy === "restore" ? "Restoring..." : "Saving..." : persistence.dirty ? "Unsaved changes" : "Saved")}
      </span>
      <EditorCommands persistence={persistence} onPublish={requestPublish} onTheme={openThemePanel} />
      <button type="button" onClick={() => askAi?.open()} disabled={!!askAi?.proposal} aria-keyshortcuts="Control+K Meta+K"
        className="platform-button platform-button-ai"><Sparkles size={13} />Ask AI</button>
      <VersionHistory persistence={persistence} siteId={siteId} />
      <button
        type="button"
        onClick={openThemePanel}
        className="platform-button"
      >
        <Palette size={13} />Theme
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void run("save")}
        className="platform-button"
      >
        {busy === "save" ? "Saving…" : "Save draft"}
      </button>
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="platform-button"
      >
        <Eye size={13} />Preview
      </a>
      <button
        type="button"
        disabled={busy !== null}
        onClick={requestPublish}
        className="platform-button platform-button-primary"
      >
        {busy === "publish" ? "Publishing…" : "Publish"}
      </button>
      {placeholderHits ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <TriangleAlert size={20} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  Some placeholder text hasn&apos;t been replaced yet
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Text in [brackets] or template placeholders is sample content — replace it with this
                  business&apos;s real details before publishing.
                </p>
              </div>
            </div>
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
  userId,
  sitePages,
  seoPages,
  generationWarnings = [],
  business,
  siteSeo,
}: {
  page: { id: string; slug: string; title: string | null };
  site: { id: string; account_id: string; name: string | null; subdomain: string; custom_domain: string | null; domain_verified: boolean; theme: SiteTheme | null };
  initialData: Record<string, unknown>;
  previewUrl: string;
  isSuperAdmin: boolean;
  userId: string;
  sitePages: EditorPageLink[];
  seoPages: SeoPageSummary[];
  generationWarnings?: string[];
  business: Business;
  siteSeo: SiteSeo;
}) {
  const searchParams = useSearchParams();
  const initialUi = useMemo(() => searchParams.get("panel") === "seo"
    ? { plugin: { current: "seo" }, leftSideBarVisible: true }
    : undefined, [searchParams]);
  const [showGenerationWarnings, setShowGenerationWarnings] = useState(true);
  const [theme, setTheme] = useState<SiteTheme>(site.theme ?? {});
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
      siteSeo,
      business, theme,
    }),
    [page.id, page.title, page.slug, previewUrl, site.id, site.subdomain, site.custom_domain, site.domain_verified, siteSeo, seoPages, business, theme, themePanelOpen],
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
      headerActions: () => <HeaderActions />,
      actionBar: (props) => <EditorActionBar {...props} />,
      drawerItem: (props) => <EditorDrawerItem {...props} />,
      drawer: ({ children }) => <EditorDrawer>{children}</EditorDrawer>,
      fields: (props) => <EditorInspector {...props} />,
      preview: ({ children }) => (
        <AskAiCanvas>
          {children}
          <BuildEmptyPage canvas />
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
        </EditorAiProvider></EditorRuntime>
      ),
    }),
    [],
  );

  const config = useMemo(() => editorConfig(isSuperAdmin), [isSuperAdmin]);

  const data = useMemo<Data>(() => {
    const raw = (initialData ?? {}) as Partial<Data>;
    const rootProps = raw.root?.props ?? {};
    return {
      content: raw.content ?? [],
      ...raw,
      root: {
        ...raw.root,
        props: { title: page.title ?? "", description: "", ...rootProps },
      },
    } as Data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <EditorSiteContext.Provider value={{ siteId: site.id, query: business.businessType }}>
      <EditorUiContext.Provider value={editorUi}>
        <SectionLibraryContext.Provider value={sectionLibraryUi}>
          <InteractionContext.Provider value={interactionUi}>
          <div className="platform-editor h-screen pb-9">
            {showGenerationWarnings && generationWarnings.length ? <aside role="status" className="fixed bottom-12 left-4 z-[100] max-h-56 w-[min(420px,90vw)] overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950 shadow-lg">
              <p className="font-semibold">AI draft review notes</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">{generationWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              <button type="button" className="mt-3 underline" onClick={() => setShowGenerationWarnings(false)}>Dismiss</button>
            </aside> : null}
            <Puck
              config={config}
              data={data}
              ui={initialUi}
              metadata={{ theme, siteMenu: { links: pageMenuLinks(sitePages.filter((page) => !page.hide_from_menu && !page.ai_pending_build)), contacts: siteContacts(business) } }}
              overrides={overrides}
              plugins={editorPlugins}
              headerTitle={`${site.name ?? site.subdomain} / ${page.title || page.slug || "Home"}`}
              headerPath={page.slug ? `/${page.slug}` : "/"}
            />
          </div>
          </InteractionContext.Provider>
        </SectionLibraryContext.Provider>
      </EditorUiContext.Provider>
    </EditorSiteContext.Provider>
  );
}
