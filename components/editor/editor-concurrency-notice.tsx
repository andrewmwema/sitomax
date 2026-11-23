"use client";

import { useEffect, useState } from "react";
import { heartbeatPageEditor } from "@/app/editor/[pageId]/presence-actions";

const HEARTBEAT_MS = 15_000;
const OVERDUE_MS = 10_000;
const UNAVAILABLE = "Could not check for other editors. Version checks still protect your saves.";

// One presence session per page in this tab. A remount reuses it (React
// remounts every effect in development), so a tab never counts itself as
// another editor.
const sessions = new Map<string, { id: string; mounts: number }>();

export function EditorConcurrencyNotice({ pageId, reloadRequired }: { pageId: string; reloadRequired: boolean }) {
  const [others, setOthers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const session = sessions.get(pageId) ?? { id: crypto.randomUUID(), mounts: 0 };
    sessions.set(pageId, session);
    session.mounts++;
    let active = true;
    let pending: Promise<void> | null = null;
    // A failed or overdue check means presence is unknown: say so instead of repeating the last answer.
    const unknown = (message: string) => { if (active) { setOthers(0); setError(message); } };
    const heartbeat = () => {
      if (pending) return;
      const overdue = window.setTimeout(() => unknown(UNAVAILABLE), OVERDUE_MS);
      pending = (async () => {
        try {
          const result = await heartbeatPageEditor(pageId, session.id);
          if ("error" in result) unknown(result.error);
          else if (active) { setOthers(result.others); setError(null); }
        } catch {
          unknown(UNAVAILABLE);
        } finally { window.clearTimeout(overdue); pending = null; }
      })();
    };
    // Server Actions cannot be sent while a page unloads, so closing or reloading the tab uses a beacon.
    const leave = () => { navigator.sendBeacon("/api/editor/presence", JSON.stringify({ pageId, sessionId: session.id })); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) heartbeat(); };
    const visible = () => { if (document.visibilityState === "visible") heartbeat(); };
    heartbeat();
    const timer = window.setInterval(heartbeat, HEARTBEAT_MS);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", visible);
      session.mounts--;
      void (pending ?? Promise.resolve()).then(async () => {
        if (session.mounts > 0) return;
        if (sessions.get(pageId) === session) sessions.delete(pageId);
        const result = await heartbeatPageEditor(pageId, session.id, true);
        if ("error" in result) console.warn(result.error);
      }).catch(() => console.warn("Could not close the editor session; it will expire automatically."));
    };
  }, [pageId]);

  if (!reloadRequired && !others && !error) return null;
  return <aside role="alert" className="editor-concurrency-notice">
    <span>{reloadRequired ? "This page changed in another editor. Reload before saving. Your unsaved changes are still in this tab."
      : others ? "This page is open in another tab — changes may overwrite each other" : error}</span>
    {reloadRequired ? <button type="button" className="platform-button shrink-0" onClick={() => window.location.reload()}>Reload page</button> : null}
  </aside>;
}
