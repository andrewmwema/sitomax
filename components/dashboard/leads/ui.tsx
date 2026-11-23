"use client";

import {
  useCallback, useEffect, useId, useRef, useState, useSyncExternalStore,
  type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref,
} from "react";
import { Check } from "lucide-react";
import { leadStatusLabels, type Lead } from "@/lib/forms/submissions";
import { avatarTone, leadInitials } from "./format";

export async function copyLeadValue(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    leadToast(`${label} copied.`);
  } catch {
    leadToast(`Could not copy the ${label.toLowerCase()}.`, "error");
  }
}

export function IconButton({ label, tip, tipSide, tipAlign, active, className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; tip?: string; tipSide?: "top"; tipAlign?: "start" | "end"; active?: boolean; ref?: Ref<HTMLButtonElement>;
}) {
  return <button type="button" aria-label={label} data-tip={tip ?? label} data-tip-side={tipSide} data-tip-align={tipAlign}
    data-active={active || undefined} className={`leads-icon-button ${className}`} {...props}>{children}</button>;
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return <span aria-hidden className="flex shrink-0 select-none items-center justify-center rounded-full font-semibold"
    style={{ ...avatarTone(name), width: size, height: size, fontSize: Math.round(size * 0.36) }}>{leadInitials(name)}</span>;
}

export function StatusPill({ status, children }: { status: Lead["status"]; children?: ReactNode }) {
  return <span className="leads-pill" data-status={status}>{leadStatusLabels[status]}{children}</span>;
}

const ITEMS = '[role^="menuitem"]:not(:disabled)';

type PopoverTrigger = {
  ref: Ref<HTMLButtonElement>; "aria-haspopup": "menu" | "dialog"; "aria-expanded": boolean; "aria-controls": string; onClick: () => void;
};

/** A menu (arrow-key navigation) or a small labelled panel, anchored to its trigger. */
export function Popover({ trigger, children, label, role = "menu", align = "start", side = "bottom", className = "" }: {
  trigger: (props: PopoverTrigger, open: boolean) => ReactNode;
  children: (close: (refocus?: boolean) => void) => ReactNode;
  label: string; role?: "menu" | "dialog"; align?: "start" | "end"; side?: "bottom" | "top"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [returned, setReturned] = useState(0);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>(role === "menu" ? ITEMS : "input, textarea, select, button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open, role]);

  // Focus goes back to the trigger after the panel has closed.
  useEffect(() => {
    if (returned) button.current?.focus();
  }, [returned]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) setReturned((count) => count + 1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (role !== "menu") return;
    if (event.key === "Tab") { close(false); return; }
    const list = [...event.currentTarget.querySelectorAll<HTMLElement>(ITEMS)];
    const index = list.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? list[(index + 1) % list.length]
      : event.key === "ArrowUp" ? list[(index - 1 + list.length) % list.length]
      : event.key === "Home" ? list[0] : event.key === "End" ? list[list.length - 1] : null;
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return <span ref={root} className="relative inline-flex" onBlur={(event) => {
    if (open && event.relatedTarget && !root.current?.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    {trigger({
      ref: button, "aria-haspopup": role, "aria-expanded": open, "aria-controls": id, onClick: () => setOpen((value) => !value),
    }, open)}
    {open ? <div ref={panel} id={id} role={role} aria-label={label} onKeyDown={onKeyDown}
      className={`leads-menu ${side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"} ${align === "end" ? "right-0" : "left-0"} ${className}`}>
      {children(close)}
    </div> : null}
  </span>;
}

export function MenuItem({ children, tone, checked, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "danger"; checked?: boolean }) {
  const role = checked === undefined ? "menuitem" : "menuitemradio";
  return <button type="button" role={role} aria-checked={checked} data-tone={tone} className="leads-menu-item" {...props}>
    {children}
    {checked ? <Check size={14} className="ml-auto text-[var(--lead-blue)]" aria-hidden /> : null}
  </button>;
}

const noSubscription = () => () => {};

/** False on the server and during hydration, so local times and dates never mismatch. */
export function useHydrated() {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

export function useLeadMedia(query: string) {
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia?.(query);
    media?.addEventListener("change", notify);
    return () => media?.removeEventListener("change", notify);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false, () => false);
}

let clock = 0;
let ticker: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();
function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  ticker ??= setInterval(() => {
    clock = Date.now();
    clockListeners.forEach((notify) => notify());
  }, 30_000);
  return () => {
    clockListeners.delete(listener);
    if (!clockListeners.size) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };
}

/** The current time, refreshed twice a minute; 0 until the page has hydrated. */
export function useNow() {
  return useSyncExternalStore(subscribeClock, () => (clock ||= Date.now()), () => 0);
}

const storeListeners = new Set<() => void>();
function subscribeStore(listener: () => void) {
  storeListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    storeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readStored(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function writeStored(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, quota); the preference then lasts for this visit only.
  }
  storeListeners.forEach((notify) => notify());
}

/** A value remembered in this browser. Null until hydrated or when nothing is stored. */
export function useStored(key: string) {
  return useSyncExternalStore(subscribeStore, () => readStored(key), () => null);
}

type Toast = { id: number; message: string; tone: "info" | "error"; action?: { label: string; run: () => void } };
let toasts: Toast[] = [];
let toastId = 0;
const toastListeners = new Set<() => void>();
const noToasts: Toast[] = [];

export function leadToast(message: string, tone: Toast["tone"] = "info", action?: Toast["action"]) {
  const id = ++toastId;
  const update = (next: Toast[]) => {
    toasts = next;
    toastListeners.forEach((notify) => notify());
  };
  update([...toasts.slice(-2), { id, message, tone, action }]);
  setTimeout(() => update(toasts.filter((toast) => toast.id !== id)), action ? 8000 : tone === "error" ? 7000 : 4000);
}

export function LeadToaster() {
  const items = useSyncExternalStore((listener) => {
    toastListeners.add(listener);
    return () => { toastListeners.delete(listener); };
  }, () => toasts, () => noToasts);
  return <div aria-live="polite" role="status" className="leads-toaster pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center gap-2 px-4">
    {items.map((toast) => <div key={toast.id} className="leads-toast pointer-events-auto" data-tone={toast.tone}>
      <span>{toast.message}</span>
      {toast.action ? <button type="button" className="shrink-0 rounded px-2 font-semibold underline underline-offset-4" onClick={() => {
        toasts = toasts.filter((item) => item.id !== toast.id);
        toastListeners.forEach((notify) => notify());
        toast.action?.run();
      }}>{toast.action.label}</button> : null}
    </div>)}
  </div>;
}
