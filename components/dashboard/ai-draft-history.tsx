"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreAiDrafts } from "@/app/(dashboard)/dashboard/sites/new/ai/actions";

export function AiDraftHistory({ siteId, versions }: {
  siteId: string; versions: { id: string; created_at: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <section id="ai-history" className="platform-panel p-6">
    <h2 className="font-semibold">Version history: AI draft backups</h2>
    <p className="mt-2 text-sm text-zinc-600">Site-wide drafts and theme saved before AI replacement or restore. Published pages are never changed. Page-level published versions remain available in the editor&apos;s History.</p>
    <ul className="mt-4 divide-y">{versions.map((version) => <li key={version.id} className="flex items-center justify-between gap-3 py-3 text-sm">
      <time dateTime={version.created_at}>{new Date(version.created_at).toLocaleString()}</time>
      <button disabled={pending} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40" onClick={() => {
        if (!window.confirm("Restore all backed-up drafts and the draft theme? Your current drafts will also be backed up. Published pages will not change.")) return;
        startTransition(async () => {
          try {
            const result = await restoreAiDrafts({ siteId, versionId: version.id });
            setMessage(result.status === "success" ? "Drafts restored. Open the editor to review them." : result.message);
            if (result.status === "success") router.refresh();
          } catch {
            setMessage("Could not restore this backup. Please retry.");
          }
        });
      }}>Restore drafts</button>
    </li>)}</ul>
    {!versions.length ? <p className="mt-3 text-sm text-zinc-500">No AI draft backups yet.</p> : null}
    {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
  </section>;
}
