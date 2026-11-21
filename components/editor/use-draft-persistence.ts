"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { publishPage, restorePageVersion, saveAiEdit, savePageDraft } from "@/app/editor/[pageId]/actions";
import type { SiteTheme } from "@/lib/theme/presets";
import { buildEmptyPageWithAi, saveEmptyPageWithAi } from "@/app/editor/[pageId]/empty-page-actions";
import { isEmptyPage } from "@/lib/editor/empty-page";
import type { SiteHeaderData } from "@/lib/header";

type EditorRoot = NonNullable<Data["root"]["props"]> & { __editorTheme?: SiteTheme; __editorHeader?: SiteHeaderData; __expectedHeader?: unknown };
function themeOverride(data: Data) { return (data.root.props as EditorRoot | undefined)?.__editorTheme; }
export function withEditorTheme(data: Data, theme: SiteTheme): Data {
  const props: EditorRoot = { ...data.root.props, __editorTheme: theme };
  return { ...data, root: { ...data.root, props } };
}
export function editorTheme(data: Data, fallback: SiteTheme): SiteTheme {
  return themeOverride(data) ?? fallback;
}

const usePuck = createUsePuck();
export function useDraftPersistence(
  pageId: string,
  theme: SiteTheme,
  initialHeader?: unknown,
  onDraftSaved?: (data: Data, kind: "save" | "publish") => void,
) {
  const getPuck = useGetPuck();
  const data = usePuck((state) => state.appState.data);
  const [saved, setSaved] = useState(() => JSON.stringify(data));
  const [busy, setBusy] = useState<"save" | "publish" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buildNotes, setBuildNotes] = useState<string[]>([]);
  const active = useRef<Promise<boolean> | null>(null);
  const savedTheme = useRef(theme);
  const savedHeader = useRef(initialHeader ?? null);
  const forSaving = useCallback((snapshot: Data): Data => {
    const root = snapshot.root.props as EditorRoot | undefined;
    if (!root?.__editorHeader) return snapshot;
    const props: EditorRoot = { ...root, __expectedHeader: savedHeader.current };
    return { ...snapshot, root: { ...snapshot.root, props } };
  }, []);
  const markHeaderSaved = useCallback((snapshot: Data) => {
    const root = snapshot.root.props as EditorRoot | undefined;
    if (root?.__editorHeader) savedHeader.current = root.__editorHeader;
  }, []);
  const lastOverride = useRef<string | undefined>(undefined);
  const dirty = JSON.stringify(data) !== saved;

  const save = useCallback(async (kind: "save" | "publish" = "save"): Promise<boolean> => {
    while (active.current) await active.current;
    const snapshot = structuredClone(getPuck().appState.data);
    setBusy(kind); setError(null);
    const operation = (async () => {
      try {
        const override = JSON.stringify(themeOverride(snapshot));
        if (override !== lastOverride.current) {
          const next = editorTheme(snapshot, theme);
          const result = await saveAiEdit(pageId, forSaving(snapshot), { snapshot: false, theme: next, expectedTheme: savedTheme.current });
          if (result.status !== "success") {
            setError(result.status === "error" ? result.message : "The theme was not saved.");
            return false;
          }
          savedTheme.current = next;
          markHeaderSaved(snapshot);
          lastOverride.current = override;
          setSaved(JSON.stringify(snapshot));
          if (kind === "save") {
            onDraftSaved?.(snapshot, kind);
            return true;
          }
        }
        const result = await (kind === "publish" ? publishPage : savePageDraft)(pageId, forSaving(snapshot));
        if (result.status !== "success") {
          setError(result.status === "error" ? result.message : "The page was not saved.");
          return false;
        }
        setSaved(JSON.stringify(snapshot));
        markHeaderSaved(snapshot);
        onDraftSaved?.(snapshot, kind);
        return true;
      } catch (cause) {
        console.error("Unable to save editor changes", cause);
        setError("Could not save your changes. Please retry.");
        return false;
      } finally { setBusy(null); active.current = null; }
    })();
    active.current = operation;
    return operation;
  }, [getPuck, pageId, theme, forSaving, markHeaderSaved, onDraftSaved]);

  const applyAi = useCallback(async (base: Data, next: Data, nextTheme?: SiteTheme, capture = true): Promise<boolean> => {
    while (active.current) await active.current;
    if (JSON.stringify(getPuck().appState.data) !== JSON.stringify(base)) {
      setError("The draft changed during preview. Generate a new proposal.");
      return false;
    }
    const snapshot = nextTheme ? withEditorTheme(next, nextTheme) : next;
    setBusy("save"); setError(null);
    const operation = (async () => {
      try {
        const result = await saveAiEdit(pageId, forSaving(snapshot), { snapshot: capture, ...(nextTheme ? {
          theme: nextTheme, expectedTheme: lastOverride.current ? savedTheme.current : theme,
        } : {}) });
        if (result.status !== "success") {
          setError(result.status === "error" ? result.message : "The AI edit was not saved.");
          return false;
        }
        if (nextTheme) {
          savedTheme.current = nextTheme;
          lastOverride.current = JSON.stringify(nextTheme);
        }
        markHeaderSaved(snapshot);
        getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
        getPuck().dispatch({ type: "setData", data: snapshot, recordHistory: true });
        setSaved(JSON.stringify(snapshot));
        onDraftSaved?.(snapshot, "save");
        return true;
      } catch {
        setError("Could not save your AI edit. Please retry.");
        return false;
      } finally { setBusy(null); active.current = null; }
    })();
    active.current = operation;
    return operation;
  }, [getPuck, pageId, theme, forSaving, markHeaderSaved, onDraftSaved]);

  const buildEmptyPage = useCallback(async (): Promise<boolean> => {
    if (active.current) return false;
    const base = structuredClone(getPuck().appState.data);
    if (!isEmptyPage(base)) {
      setError("Only empty pages can be built with AI.");
      return false;
    }
    const header = (base.root.props as EditorRoot | undefined)?.__editorHeader;
    if (header && JSON.stringify(header) !== JSON.stringify(savedHeader.current) && !await save()) return false;
    setBusy("save"); setError(null); setBuildNotes([]);
    const operation = (async () => {
      try {
        const proposal = await buildEmptyPageWithAi(pageId);
        if (proposal.status === "error") { setError(proposal.message); return false; }
        if (JSON.stringify(getPuck().appState.data) !== JSON.stringify(base)) {
          setError("The page changed while AI was working. No AI draft was saved.");
          return false;
        }
        const next = { ...proposal.data, root: { ...base.root, props: {
          ...base.root.props, generationWarnings: proposal.warnings,
        } } } as Data;
        const result = await saveEmptyPageWithAi(pageId, next, proposal.expectedDraft);
        if (result.status !== "success") { setError(result.message); return false; }
        setBuildNotes(proposal.warnings);
        if (JSON.stringify(getPuck().appState.data) !== JSON.stringify(base)) {
          setError("The AI draft was saved, but newer local changes were retained. Reload to review the saved draft.");
          return false;
        }
        getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
        getPuck().dispatch({ type: "setData", data: next, recordHistory: true });
        setSaved(JSON.stringify(next));
        onDraftSaved?.(next, "save");
        return true;
      } catch {
        setError("Could not build this page. Your local draft has not been replaced.");
        return false;
      } finally { setBusy(null); active.current = null; }
    })();
    active.current = operation;
    return operation;
  }, [getPuck, pageId, save, onDraftSaved]);

  const restore = useCallback(async (versionId: string): Promise<boolean> => {
    while (active.current) await active.current;
    setBusy("restore"); setError(null);
    const operation = (async () => {
      try {
        const result = await restorePageVersion(pageId, versionId);
        if (result.status !== "success" || !("data" in result)) {
          setError(result.status === "error" ? result.message : "Version could not be restored.");
          return false;
        }
        const current = getPuck().appState.data;
        const restored = result.theme || themeOverride(current)
          ? withEditorTheme(result.data as Data, result.theme ?? editorTheme(current, theme)) : result.data as Data;
        if (result.theme) {
          savedTheme.current = result.theme;
          lastOverride.current = JSON.stringify(result.theme);
        }
        if ("header" in result && result.header) savedHeader.current = result.header;
        getPuck().dispatch({ type: "setData", data: restored, recordHistory: true });
        getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
        setSaved(JSON.stringify(restored));
        onDraftSaved?.(restored, "save");
        return true;
      } catch (cause) {
        console.error("Unable to restore editor version", cause);
        setError("Could not restore this version. Please retry.");
        return false;
      } finally { setBusy(null); active.current = null; }
    })();
    active.current = operation;
    return operation;
  }, [getPuck, pageId, theme, onDraftSaved]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!active.current && JSON.stringify(getPuck().appState.data) !== saved) void save();
    }, 10_000);
    return () => clearInterval(timer);
  }, [getPuck, save, saved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return { busy, dirty, error, save, restore, applyAi, buildEmptyPage, buildNotes };
}
