"use client";

import { useEffect, useState } from "react";
import { heartbeatPageEditor } from "@/app/editor/[pageId]/presence-actions";

export function EditorConcurrencyNotice({ pageId, reloadRequired }: { pageId: string; reloadRequired: boolean }) {
  const [others, setOthers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const session = crypto.randomUUID();
    let active = true;
    let pending: Promise<void> | null = null;
    const heartbeat = () => {
      if (pending) return;
      pending = (async () => {
        try {
          const result = await heartbeatPageEditor(pageId, session);
          if (!active) return;
          if ("error" in result) setError(result.error);
          else { setOthers(result.others); setError(null); }
        } catch {
          if (active) setError("Could not check for other editors. Version checks still protect your saves.");
        } finally { pending = null; }
      })();
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      void (pending ?? Promise.resolve()).then(() => heartbeatPageEditor(pageId, session, true)).then((result) => {
        if ("error" in result) console.warn(result.error);
      }).catch(() => console.warn("Could not close the editor session; it will expire automatically."));
    };
  }, [pageId]);

  if (!reloadRequired && !others && !error) return null;
  return <aside role="alert" className="editor-concurrency-notice">
    <span>{reloadRequired ? "This page changed in another editor. Reload before saving. Your unsaved changes are still in this tab."
      : others ? "This page is open in another tab — changes may overwrite each other" : error}</span>
    {others && error && !reloadRequired ? <span>{error}</span> : null}
    {reloadRequired ? <button type="button" className="platform-button shrink-0" onClick={() => window.location.reload()}>Reload page</button> : null}
  </aside>;
}
