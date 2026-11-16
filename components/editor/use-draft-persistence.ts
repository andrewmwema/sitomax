"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { publishPage, restorePageVersion, savePageDraft } from "@/app/editor/[pageId]/actions";

const usePuck = createUsePuck();
export function useDraftPersistence(pageId: string) {
  const getPuck = useGetPuck();
  const data = usePuck((state) => state.appState.data);
  const [saved, setSaved] = useState(() => JSON.stringify(data));
  const [busy, setBusy] = useState<"save" | "publish" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<Promise<boolean> | null>(null);
  const dirty = JSON.stringify(data) !== saved;

  const save = useCallback(async (kind: "save" | "publish" = "save"): Promise<boolean> => {
    while (active.current) await active.current;
    const snapshot = structuredClone(getPuck().appState.data);
    setBusy(kind); setError(null);
    const operation = (async () => {
      try {
        const result = await (kind === "publish" ? publishPage : savePageDraft)(pageId, snapshot);
        if (result.status !== "success") {
          setError(result.status === "error" ? result.message : "The page was not saved.");
          return false;
        }
        setSaved(JSON.stringify(snapshot));
        return true;
      } catch (cause) {
        console.error("Unable to save editor changes", cause);
        setError("Could not save your changes. Please retry.");
        return false;
      } finally { setBusy(null); active.current = null; }
    })();
    active.current = operation;
    return operation;
  }, [getPuck, pageId]);

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
        const restored = result.data as Data;
        getPuck().dispatch({ type: "setData", data: restored, recordHistory: true });
        getPuck().dispatch({ type: "setUi", ui: { itemSelector: null } });
        setSaved(JSON.stringify(restored));
        return true;
      } catch (cause) {
        console.error("Unable to restore editor version", cause);
        setError("Could not restore this version. Please retry.");
        return false;
      } finally { setBusy(null); active.current = null; }
    })();
    active.current = operation;
    return operation;
  }, [getPuck, pageId]);

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

  return { busy, dirty, error, save, restore };
}
