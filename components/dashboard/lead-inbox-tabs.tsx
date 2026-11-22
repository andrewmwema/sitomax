"use client";

import { useState, type ReactNode } from "react";

export function LeadInboxTabs({ details, notes, timeline }: {
  details: ReactNode;
  notes: ReactNode;
  timeline: ReactNode;
}) {
  const [tab, setTab] = useState<"details" | "notes" | "timeline">("details");
  return <aside className="min-w-0 border-l border-[var(--platform-line)]">
    <div className="sticky top-16 z-10 flex border-b border-[var(--platform-line)] bg-[var(--platform-ground)] px-3" role="tablist" aria-label="Lead information">
      {(["details", "notes", "timeline"] as const).map((name) => <button
        key={name}
        type="button"
        role="tab"
        aria-selected={tab === name}
        className={`border-b-2 px-3 py-3 text-xs font-medium capitalize ${tab === name ? "border-[var(--platform-accent)] text-[var(--platform-accent)]" : "border-transparent text-[var(--platform-muted)]"}`}
        onClick={() => setTab(name)}
      >{name}</button>)}
    </div>
    <div className="p-4">
      {tab === "details" ? details : tab === "notes" ? notes : timeline}
    </div>
  </aside>;
}
