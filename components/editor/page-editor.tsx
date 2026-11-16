"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActionBar,
  Puck,
  useGetPuck,
  type Data,
  type Overrides,
} from "@puckeditor/core";
import { Bookmark, TriangleAlert } from "lucide-react";
import { puckConfig } from "@/lib/puck/config";
import type { SiteTheme } from "@/lib/theme/presets";
import {
  findUnreplacedPlaceholders,
  type PlaceholderHit,
} from "@/lib/sections/placeholders";
import { publishPage, savePageDraft } from "@/app/editor/[pageId]/actions";
import { EditorSiteContext } from "@/components/editor/image-upload-field";
import { ThemePanel } from "@/components/editor/theme-panel";
import {
  ROOT_ZONE,
  SectionLibraryContext,
  SectionLibraryModal,
  useSectionLibrary,
  type SectionLibraryUi,
} from "@/components/editor/section-library";
import {
  AddSectionEndBar,
  CanvasInsertZones,
} from "@/components/editor/canvas-insert";
import { SaveDesignDialog } from "@/components/editor/save-design-dialog";

type EditorUi = {
  pageId: string;
  previewUrl: string;
  openThemePanel: () => void;
};

const EditorUiContext = createContext<EditorUi | null>(null);

function useEditorUi(): EditorUi {
  const context = useContext(EditorUiContext);
  if (!context) throw new Error("EditorUiContext missing");
  return context;
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
  const { pageId, previewUrl, openThemePanel } = useEditorUi();
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [placeholderHits, setPlaceholderHits] = useState<PlaceholderHit[] | null>(null);
  const messageTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    async (kind: "save" | "publish") => {
      setBusy(kind);
      const { appState } = getPuck();
      const action = kind === "save" ? savePageDraft : publishPage;
      const result = await action(pageId, appState.data);
      setBusy(null);
      setMessage(result.status === "idle" ? null : result.message);
      if (messageTimeout.current) clearTimeout(messageTimeout.current);
      messageTimeout.current = setTimeout(() => setMessage(null), 4000);
    },
    [getPuck, pageId],
  );

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
    <div className="flex items-center gap-2">
      {message ? <span className="text-xs text-zinc-500">{message}</span> : null}
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
        className={`${buttonClasses} bg-emerald-600 text-white hover:bg-emerald-700`}
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
                  Text in [brackets] is sample content — replace it with this
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
                className={`${buttonClasses} bg-emerald-600 text-white hover:bg-emerald-700`}
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
 * Action bar override: replicates Puck's default layout and adds the
 * super-admin-only "Save as design" action.
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
  const { isSuperAdmin, openSaveDesign } = useSectionLibrary();
  return (
    <ActionBar>
      <ActionBar.Group>
        {parentAction}
        {label ? <ActionBar.Label label={label} /> : null}
      </ActionBar.Group>
      <ActionBar.Group>
        {isSuperAdmin ? (
          <ActionBar.Action label="Save as design" onClick={openSaveDesign}>
            <Bookmark size={16} />
          </ActionBar.Action>
        ) : null}
        {children}
      </ActionBar.Group>
      {dragHandle ? <ActionBar.Group>{dragHandle}</ActionBar.Group> : null}
    </ActionBar>
  );
}

export function PageEditor({
  page,
  site,
  initialData,
  previewUrl,
  isSuperAdmin,
}: {
  page: { id: string; slug: string; title: string | null };
  site: { id: string; name: string | null; subdomain: string; theme: SiteTheme | null };
  initialData: Record<string, unknown>;
  previewUrl: string;
  isSuperAdmin: boolean;
}) {
  const [theme, setTheme] = useState<SiteTheme>(site.theme ?? {});
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [library, setLibrary] = useState({ open: false, index: 0 });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const editorUi = useMemo<EditorUi>(
    () => ({
      pageId: page.id,
      previewUrl,
      openThemePanel: () => setThemePanelOpen(true),
    }),
    [page.id, previewUrl],
  );

  const sectionLibraryUi = useMemo<SectionLibraryUi>(
    () => ({
      isSuperAdmin,
      theme,
      library,
      openLibrary: (index: number) => setLibrary({ open: true, index }),
      closeLibrary: () => setLibrary((prev) => ({ ...prev, open: false })),
      saveDialogOpen,
      openSaveDesign: () => setSaveDialogOpen(true),
      closeSaveDesign: () => setSaveDialogOpen(false),
    }),
    [isSuperAdmin, theme, library, saveDialogOpen],
  );

  // Stable overrides (Puck requirement); components read React context.
  const overrides = useMemo<Partial<Overrides>>(
    () => ({
      headerActions: () => <HeaderActions />,
      actionBar: (props) => <EditorActionBar {...props} />,
      preview: ({ children }) => (
        <>
          {children}
          <CanvasInsertZones />
          <AddSectionEndBar />
        </>
      ),
      puck: ({ children }) => (
        <>
          {children}
          <SectionLibraryModal />
          <SaveDesignDialog />
        </>
      ),
    }),
    [],
  );

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
          <div className="h-screen">
            <Puck
              config={puckConfig}
              data={data}
              metadata={{ theme }}
              overrides={overrides}
              headerTitle={page.title ?? site.name ?? site.subdomain}
              headerPath={page.slug ? `/${page.slug}` : "/"}
            />
          </div>
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
