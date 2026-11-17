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
import { Bookmark, FileText, Layers, LayoutGrid, Palette, Plus, Search, Sparkles, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
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

type EditorUi = {
  pageId: string;
  siteId: string;
  previewUrl: string;
  openThemePanel: () => void;
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
  const { pageId } = useEditorUi();
  const persistence = useDraftPersistence(pageId);
  return <PersistenceContext.Provider value={persistence}>{children}</PersistenceContext.Provider>;
}

function PagesPanel() {
  const { pages, pageId } = useInteractions();
  const persistence = usePersistence();
  const router = useRouter();
  return <div className="p-4">
    <h2 className="mb-3 text-sm font-semibold">Pages</h2>
    <div className="flex flex-col gap-1">
      {pages.map((page) => <button key={page.id} type="button" aria-current={page.id === pageId ? "page" : undefined}
        disabled={page.id === pageId || persistence.busy !== null}
        className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F7F7F5] disabled:opacity-60"
        onClick={async () => {
          if (!persistence.dirty || await persistence.save()) router.push(`/editor/${page.id}`);
        }}>{page.title || page.slug || "Home"}</button>)}
    </div>
    {persistence.error ? <p role="alert" className="mt-3 text-xs text-red-600">{persistence.error}</p> : null}
  </div>;
}

function ThemeTool() {
  const { openThemePanel } = useEditorUi();
  return <div className="p-4"><h2 className="text-sm font-semibold">Theme</h2>
    <p className="my-3 text-xs text-zinc-500">Update this site&apos;s colors, fonts and style.</p>
    <button type="button" className="rounded-lg bg-[#121212] px-3 py-2 text-xs text-white" onClick={openThemePanel}>Edit theme</button>
  </div>;
}

function SeoTool() {
  const getPuck = useGetPuck();
  const { setTab } = useInteractions();
  return <div className="p-4"><h2 className="text-sm font-semibold">Page SEO</h2>
    <p className="my-3 text-xs text-zinc-500">Edit the page title and description in the inspector.</p>
    <button type="button" className="rounded-lg bg-[#121212] px-3 py-2 text-xs text-white" onClick={() => {
      setTab("content");
      getPuck().dispatch({ type: "setUi", ui: { itemSelector: null, rightSideBarVisible: true } });
    }}>Open page settings</button>
  </div>;
}

function AiTool() {
  return <div className="p-4"><h2 className="text-sm font-semibold">AI editing</h2>
    <p className="mt-3 text-xs text-zinc-500">AI editing in the editor is not available yet.</p>
  </div>;
}

function AiCommandBar() {
  return <aside aria-label="AI editing" className="editor-ai-bar">
    <div className="flex items-center gap-2 text-sm text-zinc-500">
      <Sparkles size={16} className="text-[#4B3FE0]" />
      <span>Ask AI to edit this page</span>
      <span className="ml-auto text-xs">Coming soon</span>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="AI suggestions, coming soon">
      {["Improve this copy", "Make it shorter", "Suggest a section"].map((suggestion) =>
        <span key={suggestion} className="rounded-full border border-[#E8E7E3] px-2 py-1 text-[11px] text-zinc-400">{suggestion}</span>)}
    </div>
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
    <div data-editor-header-actions className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" disabled={busy !== null} onClick={async () => {
        if (!persistence.dirty || await persistence.save()) router.push("/dashboard");
      }} className="rounded-lg border border-[#E8E7E3] px-3 py-2 text-xs text-zinc-700 disabled:opacity-50">Dashboard</button>
      <span role={persistence.error ? "alert" : "status"} className={`max-w-64 text-xs ${persistence.error ? "text-red-600" : "text-zinc-500"}`}>
        {persistence.error ?? (busy ? busy === "publish" ? "Publishing..." : busy === "restore" ? "Restoring..." : "Saving..." : persistence.dirty ? "Unsaved changes" : "Saved")}
      </span>
      <EditorCommands persistence={persistence} onPublish={requestPublish} onTheme={openThemePanel} />
      <VersionHistory persistence={persistence} siteId={siteId} />
      <button
        type="button"
        onClick={openThemePanel}
        className={`${buttonClasses} border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`}
      >
        Theme
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void run("save")}
        className={`${buttonClasses} border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`}
      >
        {busy === "save" ? "Saving…" : "Save draft"}
      </button>
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className={`${buttonClasses} border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`}
      >
        Preview
      </a>
      <button
        type="button"
        disabled={busy !== null}
        onClick={requestPublish}
        className={`${buttonClasses} bg-[#121212] text-white hover:bg-zinc-700`}
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
  const getPuck = useGetPuck();
  const zone = usePuckStore((s) => s.appState.ui.itemSelector?.zone);
  const selectedType = usePuckStore((s) => s.selectedItem?.type);
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
        <ActionBar.Action label="Ask AI (coming soon)" disabled><Sparkles size={16} /></ActionBar.Action>
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
  generationWarnings = [],
}: {
  page: { id: string; slug: string; title: string | null };
  site: { id: string; account_id: string; name: string | null; subdomain: string; theme: SiteTheme | null };
  initialData: Record<string, unknown>;
  previewUrl: string;
  isSuperAdmin: boolean;
  userId: string;
  sitePages: EditorPageLink[];
  generationWarnings?: string[];
}) {
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
      previewUrl,
      openThemePanel: () => setThemePanelOpen(true),
      siteId: site.id,
    }),
    [page.id, previewUrl, site.id],
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
        <>
          {children}
          <CanvasInsertZones />
          <AddSectionEndBar />
          <SectionGhost />
          <AiCommandBar />
        </>
      ),
      puck: ({ children }) => (
        <EditorRuntime>
          {children}
          <SectionLibraryPanel />
          <SaveDesignDialog />
          <EditorInteractions />
        </EditorRuntime>
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
    <EditorSiteContext.Provider value={{ siteId: site.id }}>
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
              metadata={{ theme }}
              overrides={overrides}
              plugins={editorPlugins}
              headerTitle={`${site.name ?? site.subdomain} / ${page.title || page.slug || "Home"}`}
              headerPath={page.slug ? `/${page.slug}` : "/"}
            />
          </div>
          </InteractionContext.Provider>
          <ThemePanel
            siteId={site.id}
            theme={theme}
            onChange={setTheme}
            open={themePanelOpen}
            onClose={() => setThemePanelOpen(false)}
          />
        </SectionLibraryContext.Provider>
      </EditorUiContext.Provider>
    </EditorSiteContext.Provider>
  );
}
