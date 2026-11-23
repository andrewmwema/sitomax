"use client";

import { useEffect, useRef } from "react";

export const LEAD_TRASH_EVENT = "sitomax:leads:trash";

export function LeadInboxShortcuts() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (window.matchMedia?.("(max-width: 767px)").matches) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]:not([contenteditable='false']), select, [role='menu'], [role='dialog'], dialog")) return;
      const key = event.key;
      if (event.repeat && key !== "j" && key !== "k") return;
      if (key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[type="search"][name="q"]')?.focus();
      } else if (key === "?") {
        event.preventDefault();
        dialog.current?.showModal();
      } else if (key === "j" || key === "k") {
        event.preventDefault();
        const links = [...document.querySelectorAll<HTMLAnchorElement>("a[data-lead-link]")];
        if (!links.length) return;
        const active = document.activeElement as HTMLElement | null;
        const focused = links.findIndex((link) => link === active || link.contains(active));
        const index = focused >= 0 ? focused : links.findIndex((link) => link.getAttribute("aria-current") === "true");
        const next = key === "j" ? Math.min(index + 1, links.length - 1) : Math.max(index - 1, 0);
        links[next]?.focus();
      } else if (key === "Enter" && target?.closest("a[data-lead-link]")) {
        event.preventDefault();
        target.closest<HTMLAnchorElement>("a[data-lead-link]")?.click();
      } else if (key === "#") {
        event.preventDefault();
        window.dispatchEvent(new Event(LEAD_TRASH_EVENT));
      } else if (key === "r") {
        event.preventDefault();
        const body = document.querySelector<HTMLElement>('[aria-label="Reply body"]');
        if (body) body.focus();
        else document.querySelector<HTMLButtonElement>("button[data-lead-reply]")?.click();
      } else if (key === "e") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('button[data-lead-archive][aria-label="Archive"]')?.click();
      } else if (key === "s") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>("button[data-lead-star]")?.click();
      } else if (key === "u") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('button[data-lead-unread][aria-label="Mark unread"]')?.click();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return <dialog ref={dialog} aria-label="Keyboard shortcuts" className="rounded-xl border border-[var(--platform-line)] p-0">
    <div className="w-[min(24rem,calc(100vw-2rem))] p-5">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Keyboard shortcuts</h2>
        <button type="button" className="platform-button" onClick={() => dialog.current?.close()} aria-label="Close shortcuts">Close</button></div>
      <dl className="mt-4 space-y-2 text-sm">
        {([["j / k", "Next / previous lead"], ["Enter", "Open focused lead"], ["r", "Reply"], ["e", "Archive"], ["s", "Star"], ["u", "Mark unread"], ["#", "Move to trash"], ["/", "Search"], ["Ctrl / Cmd + Enter", "Send reply"], ["Esc", "Close composer / details"], ["?", "Shortcuts"]] as const).map(([key, label]) =>
          <div key={key} className="flex justify-between gap-4"><dt>{label}</dt><dd className="rounded border px-2 text-xs">{key}</dd></div>)}
      </dl>
    </div>
  </dialog>;
}
