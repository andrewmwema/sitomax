"use client";

import { useEffect, useRef, type ReactNode } from "react";

function isElement(target: EventTarget | null): target is Element {
  return target !== null && "closest" in target && typeof target.closest === "function";
}

/** Layout/content stays server-renderable; only menu and scroll behavior hydrate. */
export function HeaderBehavior({ children, editing = false }: {
  children: ReactNode; editing?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    const win = root?.ownerDocument.defaultView;
    if (!root || !win) return;
    let opener: HTMLButtonElement | null = null;
    const dialogs = () => [...root.querySelectorAll<HTMLDialogElement>("dialog")];
    const close = () => dialogs().forEach(dialog => { if (dialog.open) dialog.close(); });
    const updateExpanded = () => {
      root.querySelectorAll("[data-header-toggle]").forEach(button => button.setAttribute("aria-expanded", "false"));
      opener?.focus();
    };
    const click = (event: MouseEvent) => {
      if (!isElement(event.target)) return;
      const toggle = event.target.closest<HTMLButtonElement>("[data-header-toggle]");
      if (toggle) {
        event.preventDefault();
        const view = toggle.closest("[data-header-device]");
        const dialog = view?.querySelector<HTMLDialogElement>("dialog");
        if (dialog) {
          opener = toggle;
          if (dialog.open) dialog.close();
          else { dialog.showModal(); toggle.setAttribute("aria-expanded", "true"); }
        }
      } else if (event.target.closest("[data-header-close], dialog a")) close();
      else if (event.target.tagName === "DIALOG") {
        const bounds = event.target.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }
      // Selecting the header in the canvas must not navigate away from the editor.
      if (editing && event.target.closest("a")) event.preventDefault();
    };
    const keydown = (event: KeyboardEvent) => {
      if (!isElement(event.target)) return;
      const dialog = event.target.closest<HTMLDialogElement>("dialog[open]");
      if (event.key === "Tab" && dialog) {
        const focusable = [...dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])")]
          .filter(element => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        const active = root.ownerDocument.activeElement;
        if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
        if (event.shiftKey && (active === first || active === dialog)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (active === last || active === dialog)) {
          event.preventDefault(); first.focus();
        }
      }
      const details = event.target.closest<HTMLDetailsElement>("details");
      if (event.key === "Escape" && details?.open) {
        details.open = false; details.querySelector("summary")?.focus(); event.preventDefault();
      }
      if (event.key === "ArrowDown" && event.target.tagName === "SUMMARY" && details) {
        details.open = true; details.querySelector("a")?.focus(); event.preventDefault();
      }
    };
    const measure = () => {
      const previous = root.dataset.scrolled;
      root.dataset.scrolled = "false";
      const view = [...root.querySelectorAll<HTMLElement>("[data-header-device]")]
        .find(header => win.getComputedStyle(header).display !== "none");
      if (view) root.style.setProperty("--sh-reserved-height", `${view.getBoundingClientRect().height}px`);
      root.dataset.scrolled = previous ?? "false";
    };
    const scroll = () => {
      const scrolled = String(win.scrollY > 24);
      if (root.dataset.scrolled !== scrolled) root.dataset.scrolled = scrolled;
    };
    const resize = () => {
      measure();
      dialogs().forEach(dialog => {
        const view = dialog.closest("[data-header-device]");
        if (dialog.open && view && win.getComputedStyle(view).display === "none") dialog.close();
      });
    };
    measure(); scroll();
    const observer = typeof win.ResizeObserver === "function" ? new win.ResizeObserver(() => {
      if (root.dataset.scrolled !== "true") measure();
    }) : undefined;
    root.querySelectorAll("[data-header-device]").forEach(header => observer?.observe(header));
    root.addEventListener("click", click);
    root.addEventListener("keydown", keydown);
    root.addEventListener("close", updateExpanded, true);
    win.addEventListener("scroll", scroll, { passive: true });
    win.addEventListener("resize", resize);
    return () => {
      close();
      root.removeEventListener("click", click); root.removeEventListener("keydown", keydown);
      root.removeEventListener("close", updateExpanded, true);
      win.removeEventListener("scroll", scroll); win.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, [editing]);
  return <div ref={ref} data-site-header="">{children}</div>;
}
