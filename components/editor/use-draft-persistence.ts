"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { publishPage, restorePageVersion, saveAiEdit, savePageDraft } from "@/app/editor/[pageId]/actions";
import type { SiteTheme } from "@/lib/theme/presets";
import { buildEmptyPageWithAi, saveEmptyPageWithAi } from "@/app/editor/[pageId]/empty-page-actions";
import { isEmptyPage } from "@/lib/editor/empty-page";
import type { SiteHeaderData } from "@/lib/header";
import { draftFingerprint } from "@/lib/editor/draft-fingerprint";
import { z } from "zod";

const flushedSaveSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), message: z.string(), version: z.uuid() }),
  z.object({ status: z.literal("error"), message: z.string(), conflict: z.boolean().optional(), retryable: z.boolean().optional() }),
]);

type EditorRoot = NonNullable<Data["root"]["props"]> & { __editorTheme?: SiteTheme; __editorHeader?: SiteHeaderData; __expectedHeader?: unknown };
type SaveDraft = (kind?: "save" | "publish", automatic?: boolean, keepalive?: boolean) => Promise<boolean>;
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
  initialHeader: unknown,
  onDraftSaved: ((data: Data, kind: "save" | "publish") => void) | undefined,
  initialVersion: string,
) {
  const getPuck = useGetPuck();
  const data = usePuck((state) => state.appState.data);
  const hash = draftFingerprint(data);
  const [saved, setSavedState] = useState(() => draftFingerprint(data));
  const [retry, setRetry] = useState({ failures: 0, at: 0 });
  const retryRef = useRef(retry);
  // Mirrors `saved` so callbacks that outlive a render compare against the latest save.
  const savedRef = useRef(saved);
  const setSaved = useCallback((value: string) => {
    savedRef.current = value; setSavedState(value);
    retryRef.current = { failures: 0, at: 0 }; setRetry(retryRef.current);
  }, []);
  const [busy, setBusy] = useState<"save" | "publish" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);
  const blocked = useRef(false);
  const version = useRef(initialVersion);
  const rejectSave = useCallback((result: { message: string; conflict?: boolean }) => {
    setError(result.message);
    if (result.conflict) { blocked.current = true; setReloadRequired(true); }
    return false;
  }, []);
  const [buildNotes, setBuildNotes] = useState<string[]>([]);
  const active = useRef<Promise<boolean> | null>(null);
  const queued = useRef<Promise<boolean> | null>(null);
  const [paused, setPaused] = useState(false);
  const lastChange = useRef({ hash, at: 0 });
  const saveRef = useRef<SaveDraft | null>(null);
  const hiddenSince = useRef<number | null>(null);
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
  const dirty = hash !== saved;

  const save = useCallback(async (kind: "save" | "publish" = "save", automatic = false, keepalive = false): Promise<boolean> => {
    if (active.current && kind === "save") {
      if (!queued.current) {
        queued.current = active.current.then(() => {
          if (!saveRef.current) throw new Error("Editor persistence is not initialized.");
          return saveRef.current(kind, automatic);
        }).finally(() => { queued.current = null; });
      }
      return queued.current;
    }
    while (active.current) await active.current;
    if (blocked.current) return false;
    const snapshot = structuredClone(getPuck().appState.data);
    if (kind === "save" && draftFingerprint(snapshot) === savedRef.current) return true;
    if (automatic && (retryRef.current.failures >= 5 || Date.now() < retryRef.current.at)) return false;
    if (automatic && !keepalive && hiddenSince.current !== null && Date.now() - hiddenSince.current >= 5 * 60_000) return false;
    if (!automatic) {
      retryRef.current = { failures: 0, at: 0 };
      setRetry(retryRef.current);
    }
    setBusy(kind); setError(null);
    let retryable = true;
    const operation = (async () => {
      try {
        const override = JSON.stringify(themeOverride(snapshot));
        if (keepalive) {
          const response = await fetch("/api/editor/draft", {
            method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pageId, data: forSaving(snapshot), expectedVersion: version.current,
              ...(override !== lastOverride.current ? { theme: editorTheme(snapshot, theme), expectedTheme: savedTheme.current } : {}),
            }),
          });
          const result = flushedSaveSchema.parse(await response.json());
          if (result.status !== "success") {
            retryable = result.retryable ?? false;
            return rejectSave(result);
          }
          version.current = result.version;
          savedTheme.current = editorTheme(snapshot, theme);
          lastOverride.current = override;
          markHeaderSaved(snapshot);
          setSaved(draftFingerprint(snapshot));
          onDraftSaved?.(snapshot, "save");
          return true;
        }
        if (override !== lastOverride.current) {
          const next = editorTheme(snapshot, theme);
          const result = await saveAiEdit(pageId, forSaving(snapshot), { snapshot: false, theme: next, expectedTheme: savedTheme.current }, version.current);
          if (result.status !== "success") {
            retryable = result.retryable ?? false;
            return rejectSave(result);
          }
          version.current = result.version;
          savedTheme.current = next;
          markHeaderSaved(snapshot);
          lastOverride.current = override;
          setSaved(draftFingerprint(snapshot));
          if (kind === "save") {
            onDraftSaved?.(snapshot, kind);
            return true;
          }
        }
        const result = await (kind === "publish" ? publishPage : savePageDraft)(pageId, forSaving(snapshot), version.current);
        if (result.status !== "success") {
          retryable = result.retryable ?? false;
          return rejectSave(result);
        }
        version.current = result.version;
        setSaved(draftFingerprint(snapshot));
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
    const succeeded = await operation;
    if (succeeded) {
      retryRef.current = { failures: 0, at: 0 };
    } else {
      const failures = retryRef.current.failures + 1;
      retryRef.current = { failures: retryable ? failures : 5, at: Date.now() + Math.min(60_000, 2_000 * 2 ** (failures - 1)) };
    }
    setRetry(retryRef.current);
    return succeeded;
  }, [getPuck, pageId, theme, forSaving, markHeaderSaved, onDraftSaved, rejectSave, setSaved]);

  const applyAi = useCallback(async (base: Data, next: Data, nextTheme?: SiteTheme, capture = true): Promise<boolean> => {
    while (active.current) await active.current;
    if (blocked.current) return false;
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
        } : {}) }, version.current);
        if (result.status !== "success") {
          return rejectSave(result);
        }
        version.current = result.version;
        if (nextTheme) {
          savedTheme.current = nextTheme;
          lastOverride.current = JSON.stringify(nextTheme);
        }
        markHeaderSaved(snapshot);
        getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
        getPuck().dispatch({ type: "setData", data: snapshot, recordHistory: true });
        setSaved(draftFingerprint(snapshot));
        onDraftSaved?.(snapshot, "save");
        return true;
      } catch {
        setError("Could not save your AI edit. Please retry.");
        return false;
      } finally { setBusy(null); active.current = null; }
    })();
    active.current = operation;
    return operation;
  }, [getPuck, pageId, theme, forSaving, markHeaderSaved, onDraftSaved, rejectSave, setSaved]);

  const buildEmptyPage = useCallback(async (): Promise<boolean> => {
    if (active.current || blocked.current) return false;
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
        const result = await saveEmptyPageWithAi(pageId, next, proposal.expectedDraft, version.current);
        if (result.status !== "success") return rejectSave(result);
        version.current = result.version;
        setBuildNotes(proposal.warnings);
        if (JSON.stringify(getPuck().appState.data) !== JSON.stringify(base)) {
          setError("The AI draft was saved, but newer local changes were retained. Reload to review the saved draft.");
          return false;
        }
        getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
        getPuck().dispatch({ type: "setData", data: next, recordHistory: true });
        setSaved(draftFingerprint(next));
        onDraftSaved?.(next, "save");
        return true;
      } catch {
        setError("Could not build this page. Your local draft has not been replaced.");
        return false;
      } finally { setBusy(null); active.current = null; }
    })();
    active.current = operation;
    return operation;
  }, [getPuck, pageId, save, onDraftSaved, rejectSave, setSaved]);

  const restore = useCallback(async (versionId: string): Promise<boolean> => {
    while (active.current) await active.current;
    if (blocked.current) return false;
    setBusy("restore"); setError(null);
    const operation = (async () => {
      try {
        const result = await restorePageVersion(pageId, versionId, version.current);
        if (result.status !== "success" || !("data" in result)) {
          return rejectSave(result);
        }
        version.current = result.version;
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
        setSaved(draftFingerprint(restored));
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
  }, [getPuck, pageId, theme, onDraftSaved, rejectSave, setSaved]);

  /**
   * Replaces the open draft with one written on the server (AI apply or undo)
   * as a single undoable step. Returns false if local edits would be lost.
   */
  const adopt = useCallback(async (next: { data: Data; version: string; theme: SiteTheme; draftHeader: unknown }): Promise<boolean> => {
    while (active.current) await active.current;
    if (blocked.current) return false;
    const current = getPuck().appState.data;
    if (draftFingerprint(current) !== savedRef.current) {
      return rejectSave({ message: "Your drafts were updated. Reload to continue editing.", conflict: true });
    }
    const themed = themeOverride(current) !== undefined || JSON.stringify(next.theme) !== JSON.stringify(theme);
    const snapshot = themed ? withEditorTheme(next.data, next.theme) : next.data;
    if (themed) lastOverride.current = JSON.stringify(next.theme);
    savedTheme.current = next.theme;
    savedHeader.current = next.draftHeader ?? null;
    version.current = next.version;
    getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
    getPuck().dispatch({ type: "setData", data: snapshot, recordHistory: true });
    setSaved(draftFingerprint(snapshot));
    setError(null);
    onDraftSaved?.(snapshot, "save");
    return true;
  }, [getPuck, theme, onDraftSaved, rejectSave, setSaved]);

  useEffect(() => { saveRef.current = save; }, [save]);

  useEffect(() => {
    if (lastChange.current.hash !== hash) lastChange.current = { hash, at: Date.now() };
    if (!dirty || busy || paused || reloadRequired || retry.failures >= 5) return;
    const due = Math.max(lastChange.current.at + 1_800, retry.at);
    const timer = setTimeout(() => { void saveRef.current?.("save", true); }, Math.max(0, due - Date.now()));
    return () => clearTimeout(timer);
  }, [hash, dirty, busy, paused, reloadRequired, retry]);

  useEffect(() => {
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      // Do not queue another request behind a save or bypass failure backoff.
      if (!active.current && !blocked.current) void saveRef.current?.("save", true, true);
    };
    const visibility = () => {
      clearTimeout(pauseTimer);
      if (document.visibilityState === "hidden") {
        hiddenSince.current = Date.now();
        flush();
        pauseTimer = setTimeout(() => setPaused(true), 5 * 60_000);
      } else {
        hiddenSince.current = null;
        setPaused(false);
        flush();
      }
    };
    if (document.visibilityState === "hidden") visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(pauseTimer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!active.current && !blocked.current) void saveRef.current?.("save", true, true);
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return { busy, dirty, error, reloadRequired, save, restore, applyAi, adopt, buildEmptyPage, buildNotes };
}
