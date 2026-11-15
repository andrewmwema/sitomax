"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Puck, useGetPuck, type Data, type Overrides } from "@puckeditor/core";
import { puckConfig } from "@/lib/puck/config";
import type { SiteTheme } from "@/lib/puck/theme";
import { publishPage, savePageDraft } from "@/app/editor/[pageId]/actions";
import { EditorSiteContext } from "@/components/editor/image-upload-field";
import { ThemePanel } from "@/components/editor/theme-panel";

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

/** Header buttons: Save draft, Preview, Publish and the theme panel toggle. */
function HeaderActions() {
  const getPuck = useGetPuck();
  const { pageId, previewUrl, openThemePanel } = useEditorUi();
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
        onClick={() => void run("publish")}
        className={`${buttonClasses} bg-emerald-600 text-white hover:bg-emerald-700`}
      >
        {busy === "publish" ? "Publishing…" : "Publish"}
      </button>
    </div>
  );
}

export function PageEditor({
  page,
  site,
  initialData,
  previewUrl,
}: {
  page: { id: string; slug: string; title: string | null };
  site: { id: string; name: string | null; subdomain: string; theme: SiteTheme | null };
  initialData: Record<string, unknown>;
  previewUrl: string;
}) {
  const [theme, setTheme] = useState<SiteTheme>(site.theme ?? {});
  const [themePanelOpen, setThemePanelOpen] = useState(false);

  const editorUi = useMemo<EditorUi>(
    () => ({
      pageId: page.id,
      previewUrl,
      openThemePanel: () => setThemePanelOpen(true),
    }),
    [page.id, previewUrl],
  );

  const overrides = useMemo<Partial<Overrides>>(
    () => ({ headerActions: () => <HeaderActions /> }),
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
      </EditorUiContext.Provider>
    </EditorSiteContext.Provider>
  );
}
