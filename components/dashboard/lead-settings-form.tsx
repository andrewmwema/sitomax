"use client";

import { useActionState, type ReactNode } from "react";
import { saveLeadSettings } from "@/app/(dashboard)/dashboard/sites/[siteId]/leads/actions";

export function LeadSettingsForm({ siteId, intent, children }: {
  siteId: string; intent: "recipients" | "preferences" | "webhook"; children: ReactNode;
}) {
  const [state, action, busy] = useActionState(saveLeadSettings, { error: "" });
  return <form action={action} className="space-y-3">
    <input type="hidden" name="site" value={siteId} />
    <input type="hidden" name="intent" value={intent} />
    {children}
    <button className="platform-button platform-button-primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
    {state.error ? <p role="alert" className="text-sm text-[var(--platform-error)]">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-sm text-[var(--platform-success)]">{state.success}</p> : null}
  </form>;
}
