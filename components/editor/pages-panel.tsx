"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useGetPuck, type Data } from "@puckeditor/core";
import { EyeOff, FilePlus2, GripVertical, Home, MoreHorizontal } from "lucide-react";
import {
  changeEditorPageSlug, createEditorPage, deleteEditorPage, duplicateEditorPage, renameEditorPage,
  reorderEditorPages, setEditorHomePage, setPageHiddenFromMenus,
} from "@/app/editor/[pageId]/page-actions";
import { rewriteLegacyPageLinks } from "@/lib/links";
import { defaultMenuLabel } from "@/lib/page-navigation";
import { slugError, slugify } from "@/lib/page-slugs";
import type { PageResult } from "@/lib/site-pages";
import type { EditorPageLink } from "./interaction-context";

type Persistence = { busy: unknown; dirty: boolean; save: () => Promise<boolean> };
type DialogState =
  | { kind: "create" }
  | { kind: "rename" | "slug" | "delete"; page: EditorPageLink };

export function pageName(page: EditorPageLink) {
  return page.title?.trim() || page.nav_label || defaultMenuLabel(page.slug);
}

/**
 * The editor's page list: create, rename, change slug, duplicate, set the
 * homepage, hide from menus, delete and reorder (drag or keyboard). Order
 * drives the header and footer menus. Server actions run under RLS; the
 * open page's draft is only changed in memory so autosave stays in charge.
 */
export function PagesManager({ siteId, pageId, pages, persistence }: {
  siteId: string; pageId: string; pages: EditorPageLink[]; persistence: Persistence;
}) {
  const router = useRouter();
  const getPuck = useGetPuck();
  // Optimistic order while a reorder is saved; new pages from a refresh are appended.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const byId = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const order = pendingOrder
    ? [...pendingOrder.filter((id) => byId.has(id)), ...pages.map(({ id }) => id).filter((id) => !pendingOrder.includes(id))]
    : pages.map(({ id }) => id);
  const ordered = order.map((id) => byId.get(id)).filter((page): page is EditorPageLink => Boolean(page));
  const disabled = working || persistence.busy !== null;

  /** Saves pending edits, runs a page action and refreshes the page list. */
  async function run(action: () => Promise<PageResult>, after?: (result: Extract<PageResult, { status: "success" }>) => void) {
    if (disabled) return false;
    setWorking(true);
    setMessage(null);
    try {
      if (persistence.dirty && !(await persistence.save())) {
        setMessage({ tone: "error", text: "Save your draft before changing pages." });
        return false;
      }
      const result = await action();
      if (result.status === "error") { setMessage({ tone: "error", text: result.message }); return false; }
      setMessage({ tone: "ok", text: result.message });
      after?.(result);
      router.refresh();
      return true;
    } catch {
      setMessage({ tone: "error", text: "Something went wrong. Try again." });
      return false;
    } finally {
      setWorking(false);
    }
  }

  function updateOpenDraft(change: (data: Data) => Data) {
    getPuck().dispatch({ type: "setData", data: (previous: Data) => change(previous) });
  }

  async function reorder(next: string[]) {
    setPendingOrder(next);
    if (!(await run(() => reorderEditorPages(siteId, next)))) setPendingOrder(null);
  }
  function move(id: string, by: number) {
    const from = order.indexOf(id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    void reorder(next);
  }

  const open = async (target: EditorPageLink) => {
    if (target.id === pageId || disabled) return;
    if (!persistence.dirty || await persistence.save()) router.push(`/editor/${target.id}`);
  };

  return <section aria-label="Pages">
    <button type="button" className="platform-button platform-button-primary mb-3 w-full" disabled={disabled}
      onClick={() => setDialog({ kind: "create" })}><FilePlus2 size={14} />New page</button>
    <ul className="flex flex-col gap-1" aria-describedby={`${siteId}-pages-help`}>
      {ordered.map((page, index) => {
        const current = page.id === pageId;
        return <li key={page.id} draggable={!disabled}
          onDragStart={(event) => { setDragging(page.id); event.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => setDragging(null)}
          onDragOver={(event) => { if (dragging && dragging !== page.id) event.preventDefault(); }}
          onDrop={(event) => {
            event.preventDefault();
            if (!dragging || dragging === page.id) return;
            const next = order.filter((id) => id !== dragging);
            next.splice(next.indexOf(page.id) + (order.indexOf(dragging) < index ? 1 : 0), 0, dragging);
            setDragging(null);
            void reorder(next);
          }}
          className={`group relative flex items-center gap-1 rounded-lg border ${current ? "border-[#D9D5FF] bg-[#F5F3FF]" : "border-transparent hover:bg-[#F7F7F5]"} ${dragging === page.id ? "opacity-50" : ""}`}>
          <span aria-hidden className="cursor-grab px-1 text-zinc-400"><GripVertical size={14} /></span>
          <button type="button" aria-current={current ? "page" : undefined} disabled={disabled && !current}
            onClick={() => void open(page)}
            onKeyDown={(event) => {
              if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                event.preventDefault();
                move(page.id, event.key === "ArrowUp" ? -1 : 1);
              }
            }}
            className="min-w-0 flex-1 py-2 text-left text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              {page.slug === "" ? <Home size={13} aria-label="Homepage" className="shrink-0 text-[#4B3FE0]" /> : null}
              <span className="truncate">{pageName(page)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="truncate">/{page.slug}</span>
              {page.hide_from_menu ? <span className="inline-flex items-center gap-0.5"><EyeOff size={11} />Hidden</span> : null}
              {page.published === false || page.hasUnpublishedChanges
                ? <span className="inline-flex items-center gap-1"><span aria-hidden className="size-1.5 rounded-full bg-amber-500" />Draft</span>
                : null}
            </span>
          </button>
          <PageMenu page={page} open={menuFor === page.id} disabled={disabled}
            onToggle={(next) => setMenuFor(next ? page.id : null)}
            canMoveUp={index > 0} canMoveDown={index < ordered.length - 1}
            onAction={(action) => {
              setMenuFor(null);
              if (action === "rename" || action === "slug" || action === "delete") setDialog({ kind: action, page });
              else if (action === "up" || action === "down") move(page.id, action === "up" ? -1 : 1);
              else if (action === "duplicate") void run(() => duplicateEditorPage(page.id));
              else if (action === "home") void run(() => setEditorHomePage(page.id));
              else if (action === "menu") void run(() => setPageHiddenFromMenus(page.id, !page.hide_from_menu));
            }} />
        </li>;
      })}
    </ul>
    <p id={`${siteId}-pages-help`} className="mt-2 text-[11px] text-zinc-500">Drag pages, or press Alt + ↑/↓, to change the menu order.</p>
    <p role="status" aria-live="polite" className={`mt-2 text-xs ${message?.tone === "error" ? "text-red-600" : "text-emerald-700"}`}>{message?.text}</p>

    {dialog?.kind === "create" ? <CreatePageDialog pages={ordered} disabled={disabled} onClose={() => setDialog(null)}
      onSubmit={(title, slug, start) => run(() => createEditorPage(siteId, title, slug, start), (result) => {
        setDialog(null);
        if (result.pageId) router.push(`/editor/${result.pageId}${start.from === "ai" ? "?build=ai" : ""}`);
      })} /> : null}
    {dialog?.kind === "rename" ? <TextDialog title="Rename page" label="Page name" initial={pageName(dialog.page)} maxLength={80}
      disabled={disabled} submitLabel="Rename" onClose={() => setDialog(null)}
      onSubmit={(title) => run(() => renameEditorPage(dialog.page.id, title, pageId), () => {
        setDialog(null);
        if (dialog.page.id === pageId) updateOpenDraft((data) => ({ ...data, root: { ...data.root, props: { ...data.root.props, title } } }));
      })} /> : null}
    {dialog?.kind === "slug" ? <SlugDialog page={dialog.page} pages={ordered} disabled={disabled} onClose={() => setDialog(null)}
      onSubmit={(slug, redirect) => run(() => changeEditorPageSlug(dialog.page.id, slug, redirect, pageId), () => {
        setDialog(null);
        // The server rewrites legacy "/old-slug" links in other drafts; do the same for the open page.
        updateOpenDraft((data) => rewriteLegacyPageLinks(data, dialog.page.slug, slug).data);
      })} /> : null}
    {dialog?.kind === "delete" ? <ConfirmDialog title={`Delete “${pageName(dialog.page)}”?`} disabled={disabled}
      body="The page, its draft and its published version are removed. Links to it will show as broken in the pre-publish check."
      confirmLabel="Delete page" onClose={() => setDialog(null)}
      onConfirm={() => run(() => deleteEditorPage(dialog.page.id), () => {
        setDialog(null);
        const home = pages.find((page) => page.slug === "");
        if (dialog.page.id === pageId && home) router.push(`/editor/${home.id}`);
      })} /> : null}
  </section>;
}

type MenuAction = "rename" | "slug" | "duplicate" | "home" | "menu" | "up" | "down" | "delete";
function PageMenu({ page, open, disabled, onToggle, onAction, canMoveUp, canMoveDown }: {
  page: EditorPageLink; open: boolean; disabled: boolean; canMoveUp: boolean; canMoveDown: boolean;
  onToggle: (open: boolean) => void; onAction: (action: MenuAction) => void;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const home = page.slug === "";
  const toggle = useRef(onToggle);
  useEffect(() => { toggle.current = onToggle; });
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    const close = (event: MouseEvent) => { if (!ref.current?.parentElement?.contains(event.target as Node)) toggle.current(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const items: { action: MenuAction; label: string; disabled?: boolean; danger?: boolean }[] = [
    { action: "rename", label: "Rename" },
    { action: "slug", label: "Edit slug", disabled: home },
    { action: "duplicate", label: "Duplicate" },
    { action: "home", label: "Set as homepage", disabled: home },
    { action: "menu", label: page.hide_from_menu ? "Show in menus" : "Hide from menus" },
    { action: "up", label: "Move up", disabled: !canMoveUp },
    { action: "down", label: "Move down", disabled: !canMoveDown },
    { action: "delete", label: home ? "Delete (homepage can't be deleted)" : "Delete", disabled: home, danger: true },
  ];
  return <>
    <button type="button" aria-label={`Page options for ${pageName(page)}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      disabled={disabled} onClick={() => onToggle(!open)}
      className="mr-1 rounded-md p-1.5 text-zinc-500 hover:bg-white hover:text-zinc-900 focus-visible:outline-2 disabled:opacity-40">
      <MoreHorizontal size={15} />
    </button>
    {open ? <div ref={ref} id={id} role="menu" aria-label={`Options for ${pageName(page)}`}
      className="absolute top-full right-0 z-30 mt-1 w-52 rounded-lg border border-[#E8E7E3] bg-white p-1 shadow-lg"
      onKeyDown={(event) => {
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "Escape") {
          event.preventDefault();
          const trigger = ref.current?.previousElementSibling;
          onToggle(false);
          if (trigger instanceof HTMLElement) trigger.focus();
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          buttons[(at + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
      }}>
      {items.map((item) => <button key={item.action} type="button" role="menuitem" disabled={item.disabled}
        onClick={() => onAction(item.action)}
        className={`block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-[#F7F7F5] focus-visible:bg-[#F7F7F5] disabled:cursor-not-allowed disabled:opacity-40 ${item.danger ? "text-red-700" : ""}`}>
        {item.label}
      </button>)}
    </div> : null}
  </>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}
    className="platform-ui editor-modal m-auto w-[min(440px,94vw)] rounded-xl border border-[#E8E7E3] bg-white p-5 shadow-xl backdrop:bg-zinc-950/30">
    <h2 id={titleId} className="text-sm font-semibold">{title}</h2>
    {children}
  </dialog>;
}

const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[#4B3FE0]";

function DialogButtons({ disabled, submitLabel, onClose, danger }: { disabled: boolean; submitLabel: string; onClose: () => void; danger?: boolean }) {
  return <div className="mt-5 flex justify-end gap-2">
    <button type="button" className="platform-button" onClick={onClose}>Cancel</button>
    <button type="submit" disabled={disabled} className={`platform-button ${danger ? "bg-red-600 text-white hover:bg-red-700" : "platform-button-primary"}`}>{submitLabel}</button>
  </div>;
}

type Start = { from: "blank" } | { from: "ai" } | { from: "copy"; pageId: string };
function CreatePageDialog({ pages, disabled, onClose, onSubmit }: {
  pages: EditorPageLink[]; disabled: boolean; onClose: () => void;
  onSubmit: (title: string, slug: string, start: Start) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [from, setFrom] = useState<Start["from"]>("blank");
  const [copyId, setCopyId] = useState(pages[0]?.id ?? "");
  const shownSlug = slugEdited ? slug : slugify(title);
  const taken = pages.map((page) => page.slug);
  const error = title.trim() ? slugError(shownSlug, taken) : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || error) return;
    void onSubmit(title.trim(), shownSlug, from === "copy" ? { from, pageId: copyId } : { from });
  };
  return <Modal title="New page" onClose={onClose}>
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 text-xs">
      <label className="font-medium">Page name
        <input autoFocus required maxLength={80} value={title} onChange={(event) => setTitle(event.currentTarget.value)} className={inputClass} placeholder="About us" />
      </label>
      <label className="font-medium">Slug
        <span className="mt-1 flex items-center rounded-lg border border-zinc-300 focus-within:outline-2 focus-within:outline-[#4B3FE0]">
          <span className="pl-2.5 text-zinc-500">/</span>
          <input required maxLength={60} value={shownSlug} aria-invalid={Boolean(error)} aria-describedby="new-page-slug-error"
            onChange={(event) => { setSlugEdited(true); setSlug(event.currentTarget.value.toLowerCase()); }}
            className="min-w-0 flex-1 rounded-lg px-1 py-2 text-sm outline-none" />
        </span>
        <span id="new-page-slug-error" className="mt-1 block font-normal text-red-600">{error}</span>
      </label>
      <fieldset>
        <legend className="mb-1 font-medium">Start from</legend>
        <div className="grid gap-1.5">
          {([["blank", "Blank page", "Add sections yourself."], ["copy", "Copy of an existing page", "Duplicate a page's draft."],
            ["ai", "Build with AI", "Uses your business info and theme. Uses one AI credit."]] as const).map(([value, label, hint]) =>
            <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 ${from === value ? "border-[#4B3FE0] bg-[#F5F3FF]" : "border-zinc-200"}`}>
              <input type="radio" name="start" value={value} checked={from === value} onChange={() => setFrom(value)} className="mt-0.5" />
              <span><span className="block font-medium">{label}</span><span className="text-zinc-500">{hint}</span></span>
            </label>)}
        </div>
      </fieldset>
      {from === "copy" ? <label className="font-medium">Page to copy
        <select value={copyId} onChange={(event) => setCopyId(event.currentTarget.value)} className={inputClass}>
          {pages.map((page) => <option key={page.id} value={page.id}>{pageName(page)} (/{page.slug})</option>)}
        </select>
      </label> : null}
      <DialogButtons disabled={disabled || !title.trim() || Boolean(error)} submitLabel={disabled ? "Creating…" : "Create page"} onClose={onClose} />
    </form>
  </Modal>;
}

function TextDialog({ title, label, initial, maxLength, disabled, submitLabel, onClose, onSubmit }: {
  title: string; label: string; initial: string; maxLength: number; disabled: boolean; submitLabel: string;
  onClose: () => void; onSubmit: (value: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initial);
  return <Modal title={title} onClose={onClose}>
    <form className="mt-3 text-xs" onSubmit={(event) => { event.preventDefault(); if (value.trim()) void onSubmit(value.trim()); }}>
      <label className="font-medium">{label}
        <input autoFocus required maxLength={maxLength} value={value} onChange={(event) => setValue(event.currentTarget.value)} className={inputClass} />
      </label>
      <DialogButtons disabled={disabled || !value.trim()} submitLabel={submitLabel} onClose={onClose} />
    </form>
  </Modal>;
}

function SlugDialog({ page, pages, disabled, onClose, onSubmit }: {
  page: EditorPageLink; pages: EditorPageLink[]; disabled: boolean;
  onClose: () => void; onSubmit: (slug: string, redirect: boolean) => Promise<boolean>;
}) {
  const [slug, setSlug] = useState(page.slug);
  const [redirect, setRedirect] = useState(page.published !== false);
  const error = slug === page.slug ? null : slugError(slug, pages.filter(({ id }) => id !== page.id).map((other) => other.slug));
  return <Modal title={`Edit slug for “${pageName(page)}”`} onClose={onClose}>
    <form className="mt-3 flex flex-col gap-3 text-xs" onSubmit={(event) => {
      event.preventDefault();
      if (!error && slug !== page.slug) void onSubmit(slug, redirect);
    }}>
      <label className="font-medium">Slug
        <span className="mt-1 flex items-center rounded-lg border border-zinc-300 focus-within:outline-2 focus-within:outline-[#4B3FE0]">
          <span className="pl-2.5 text-zinc-500">/</span>
          <input autoFocus required maxLength={60} value={slug} aria-invalid={Boolean(error)} aria-describedby="edit-slug-error"
            onChange={(event) => setSlug(event.currentTarget.value.toLowerCase())} className="min-w-0 flex-1 rounded-lg px-1 py-2 text-sm outline-none" />
        </span>
        <span id="edit-slug-error" className="mt-1 block font-normal text-red-600">{error}</span>
      </label>
      <p className="text-zinc-500">Links picked with the link picker follow the page automatically. Typed links to /{page.slug} in your drafts are updated too.</p>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={redirect} onChange={(event) => setRedirect(event.currentTarget.checked)} className="mt-0.5" />
        <span><span className="font-medium">Redirect /{page.slug} to the new address (301)</span>
          <span className="block text-zinc-500">Keeps search rankings and old bookmarks working.</span></span>
      </label>
      <DialogButtons disabled={disabled || Boolean(error) || slug === page.slug} submitLabel="Change slug" onClose={onClose} />
    </form>
  </Modal>;
}

function ConfirmDialog({ title, body, confirmLabel, disabled, onClose, onConfirm }: {
  title: string; body: string; confirmLabel: string; disabled: boolean; onClose: () => void; onConfirm: () => Promise<boolean>;
}) {
  return <Modal title={title} onClose={onClose}>
    <form className="text-xs" onSubmit={(event) => { event.preventDefault(); void onConfirm(); }}>
      <p className="mt-2 text-zinc-600">{body}</p>
      <DialogButtons disabled={disabled} submitLabel={confirmLabel} onClose={onClose} danger />
    </form>
  </Modal>;
}

