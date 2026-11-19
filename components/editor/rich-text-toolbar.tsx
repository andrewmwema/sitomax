"use client";

import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { registerOverlayPortal } from "@puckeditor/core";
import {
  Bold, Italic, Underline, Strikethrough, Link as LinkIcon, List, ListOrdered,
  IndentIncrease, IndentDecrease, Undo2, Redo2, RemoveFormatting, Sparkles,
  Pencil, ExternalLink, Unlink, Palette, Highlighter,
} from "lucide-react";
import { CURATED_FONTS, googleFontsUrl, isCuratedFont } from "@/lib/theme/fonts";
import { parseSiteLink, resolveLink, type LinkValue, type SiteLink } from "@/lib/links";
import { LinkPicker } from "./link-picker";
import { DEFAULT_COLORS } from "@/lib/theme/presets";
import { SectionLibraryContext } from "./section-library";
import { appPoint, InteractionContext } from "./interaction-context";
import { useOptionalEditorAi } from "./editor-ai-context";

const icons = {
  Bold, Italic, Underline, Strike: Strikethrough, Link: LinkIcon, Bullets: List,
  Numbers: ListOrdered, Indent: IndentIncrease, Outdent: IndentDecrease,
  Undo: Undo2, Redo: Redo2, "Clear formatting": RemoveFormatting,
  Edit: Pencil, Open: ExternalLink, Remove: Unlink, "Rewrite with AI": Sparkles,
  Highlight: Highlighter,
};
const shortcuts: Partial<Record<keyof typeof icons, string>> = {
  Bold: "Ctrl+B / ⌘B", Italic: "Ctrl+I / ⌘I", Underline: "Ctrl+U / ⌘U",
  Link: "Ctrl+K / ⌘K", Undo: "Ctrl+Z / ⌘Z", Redo: "Ctrl+Shift+Z / ⌘⇧Z",
};
const groupClass = "flex shrink-0 items-center gap-0.5 border-r border-zinc-200 pr-1.5 last:border-0 last:pr-0";

let activeToolbar: symbol | null = null;
const toolbarListeners = new Set<() => void>();
function activateToolbar(token: symbol | null) {
  if (activeToolbar === token) return;
  activeToolbar = token;
  toolbarListeners.forEach((notify) => notify());
}
function subscribeToolbar(notify: () => void) {
  toolbarListeners.add(notify);
  return () => { toolbarListeners.delete(notify); };
}

/** Typography applies to the current text block when there is no selection. */
export function applyTextAppearance(editor: Editor, attrs: Record<string, string | null>, blockWhenEmpty = true) {
  const { from, to, empty, $from } = editor.state.selection;
  const chain = editor.chain().focus();
  if (empty && blockWhenEmpty && $from.parent.isTextblock) {
    chain.setTextSelection({ from: $from.start(), to: $from.end() })
      .setMark("textAppearance", attrs).setTextSelection({ from, to });
  }
  return chain.setMark("textAppearance", attrs).run();
}

export function RichTextToolbar({ editor, readOnly, floating = false }: {
  editor: Editor | null; readOnly: boolean; floating?: boolean;
}) {
  const ui = useContext(InteractionContext);
  const library = useContext(SectionLibraryContext);
  const ai = useOptionalEditorAi();
  const ref = useRef<HTMLDivElement>(null);
  const [token] = useState(() => Symbol("rich-text-toolbar"));
  const active = useSyncExternalStore(subscribeToolbar, () => activeToolbar === token, () => false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number; constrained: boolean } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHint, setLinkHint] = useState(false);
  const linkSelection = useRef<{ from: number; to: number } | null>(null);
  const hasSelection = useSyncExternalStore(
    useCallback((notify: () => void) => {
      if (!editor) return () => {};
      editor.on("selectionUpdate", notify);
      return () => { editor.off("selectionUpdate", notify); };
    }, [editor]),
    useCallback(() => Boolean(editor && !editor.state.selection.empty), [editor]),
    () => false,
  );
  // Cursor inside an existing link (no selection): show Edit / Open / Remove.
  const inLink = useSyncExternalStore(
    useCallback((notify: () => void) => {
      if (!editor) return () => {};
      editor.on("selectionUpdate", notify);
      editor.on("transaction", notify);
      return () => { editor.off("selectionUpdate", notify); editor.off("transaction", notify); };
    }, [editor]),
    useCallback(() => Boolean(editor && editor.state.selection.empty && editor.isActive("link")), [editor]),
    () => false,
  );
  // Formatting and the destination can change without moving the selection.
  useSyncExternalStore(
    useCallback((notify: () => void) => {
      if (!editor) return () => {};
      editor.on("transaction", notify);
      return () => { editor.off("transaction", notify); };
    }, [editor]),
    useCallback(() => editor?.state ?? null, [editor]),
    () => null,
  );
  const requestLink = useCallback(() => {
    if (!editor || readOnly) return;
    if (editor.state.selection.empty && !editor.isActive("link")) {
      setLinkHint(true);
      setLinkOpen(false);
      return;
    }
    const { from, to } = editor.state.selection;
    linkSelection.current = { from, to };
    setLinkHint(false);
    setLinkOpen(true);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor || readOnly) return;
    const element = editor.view.dom;
    const docs = new Set([element.ownerDocument, document]);
    const hide = () => {
      if (activeToolbar === token) activateToolbar(null);
      setLinkOpen(false);
      setLinkHint(false);
      linkSelection.current = null;
    };
    const focus = () => activateToolbar(token);
    const inside = (target: EventTarget | null) =>
      target !== null && (element.contains(target as Node) || Boolean(ref.current?.contains(target as Node)));
    const interact = (event: Event) => {
      if (element.contains(event.target as Node)) focus();
      else if (!inside(event.target)) hide();
    };
    const blur = ({ event }: { event: FocusEvent }) => {
      if (inside(event.relatedTarget)) return;
      queueMicrotask(() => {
        if (![...docs].some((doc) => inside(doc.activeElement))) hide();
      });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || activeToolbar !== token) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      hide();
    };
    editor.on("focus", focus);
    editor.on("blur", blur);
    for (const doc of docs) {
      doc.addEventListener("pointerdown", interact, true);
      doc.addEventListener("focusin", interact, true);
      doc.addEventListener("keydown", escape, true);
    }
    if (editor.isFocused) focus();
    return () => {
      editor.off("focus", focus);
      editor.off("blur", blur);
      for (const doc of docs) {
        doc.removeEventListener("pointerdown", interact, true);
        doc.removeEventListener("focusin", interact, true);
        doc.removeEventListener("keydown", escape, true);
      }
      if (activeToolbar === token) activateToolbar(null);
    };
  }, [editor, readOnly, token]);

  useLayoutEffect(() => {
    if (!editor || !floating || !active) return;
    const doc = editor.view.dom.ownerDocument;
    const measure = () => {
      const rect = editor.view.dom.getBoundingClientRect();
      const start = appPoint(doc, rect.left, rect.top);
      const end = appPoint(doc, rect.right, rect.bottom);
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const toolbarHeight = ref.current?.scrollHeight ?? 44;
      const aboveSpace = Math.max(0, start.y - top - 20);
      const belowSpace = Math.max(0, top + height - end.y - 20);
      const above = aboveSpace >= toolbarHeight || aboveSpace > belowSpace;
      const maxHeight = above ? aboveSpace : belowSpace;
      const availableWidth = Math.max(0, width - 24);
      const toolbarWidth = inLink && !linkOpen
        ? Math.min(ref.current?.getBoundingClientRect().width ?? 420, availableWidth)
        : Math.min(1180, availableWidth);
      const next = {
        left: Math.max(left + 12, Math.min(start.x, left + width - toolbarWidth - 12)),
        top: above ? start.y - Math.min(toolbarHeight, maxHeight) - 8 : end.y + 8,
        width: Math.min(1180, availableWidth), maxHeight, constrained: maxHeight < toolbarHeight,
      };
      setPosition((previous) => previous && Object.entries(next).every(([key, value]) => previous[key as keyof typeof next] === value) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    observer.observe(editor.view.dom);
    doc.addEventListener("scroll", measure, true);
    doc.defaultView?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    measure();
    return () => {
      observer.disconnect();
      doc.removeEventListener("scroll", measure, true);
      doc.defaultView?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [editor, floating, active, inLink, linkOpen, linkHint]);

  useEffect(() => registerOverlayPortal(ref.current), [editor, readOnly, active, inLink, linkOpen]);
  useEffect(() => {
    if (!editor) return;
    const doc = editor.view.dom.ownerDocument;
    const shortcut = (event: KeyboardEvent) => {
      if (readOnly || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k" || !editor.isFocused) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestLink();
    };
    doc.addEventListener("keydown", shortcut, true);
    return () => doc.removeEventListener("keydown", shortcut, true);
  }, [editor, readOnly, requestLink]);

  if (!editor || readOnly || !active) return null;
  const appearance = (attrs: Record<string, string | null>, blockWhenEmpty = true) => {
    if (isCuratedFont(attrs.fontFamily)) {
      const doc = editor.view.dom.ownerDocument;
      const url = googleFontsUrl([attrs.fontFamily]);
      if (![...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some((link) => link.href === url)) {
        const link = doc.createElement("link"); link.rel = "stylesheet"; link.href = url; doc.head.appendChild(link);
      }
    }
    return applyTextAppearance(editor, attrs, blockWhenEmpty);
  };
  const applyLink = (link: SiteLink) => {
    const { href } = resolveLink(link, { pages: Object.fromEntries((ui?.pages ?? []).map((page) => [page.id, `/${page.slug}`])) });
    const rel = `noopener noreferrer${link.nofollow ? " nofollow" : ""}`;
    const chain = editor.chain().focus();
    if (linkSelection.current) chain.setTextSelection(linkSelection.current);
    if (linkSelection.current?.from === linkSelection.current?.to) chain.extendMarkRange("link");
    chain.setLink({
      href, target: link.newTab ? "_blank" : null, rel, pageId: link.type === "page" ? link.pageId : null,
    } as Parameters<typeof editor.commands.setLink>[0]).run();
    linkSelection.current = null;
    setLinkOpen(false);
  };
  const removeLink = () => {
    const chain = editor.chain().focus();
    if (linkOpen && linkSelection.current) chain.setTextSelection(linkSelection.current);
    chain.extendMarkRange("link").unsetLink().run();
    linkSelection.current = null;
    setLinkOpen(false);
  };
  const openLink = () => {
    const link = currentLink(editor);
    const typed = parseSiteLink(link);
    if (typed?.type === "page") { window.open(`/editor/${typed.pageId}`, "_blank", "noopener"); return; }
    const { href } = resolveLink(link);
    if (href.startsWith("#")) {
      editor.view.dom.ownerDocument.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (href !== "#") window.open(href, "_blank", "noopener,noreferrer");
  };
  const block = editor.isActive("heading") ? "heading" : "paragraph";
  const floatingStyle = floating ? {
    position: "fixed" as const, zIndex: 160, left: position?.left, top: position?.top,
    maxHeight: position?.maxHeight, visibility: position ? "visible" as const : "hidden" as const,
  } : undefined;
  const button = (label: keyof typeof icons, action: () => void, active = false, disabled = false) => {
    const Icon = icons[label];
    const tooltip = `${label}${shortcuts[label] ? ` (${shortcuts[label]})` : ""}`;
    return <button key={label} type="button" title={tooltip} aria-label={label} aria-pressed={active} disabled={disabled}
      onMouseDown={(event) => event.preventDefault()} onClick={action}
      className={`group/tool relative inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-1.5 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-30 ${label === "Rewrite with AI" ? "ml-auto bg-indigo-50 px-2.5 font-medium text-indigo-700 hover:bg-indigo-100" : active ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}>
      <Icon size={15} aria-hidden="true" />
      {label === "Rewrite with AI" ? label : null}
      <span role="tooltip" className="pointer-events-none absolute top-full left-1/2 z-10 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-[11px] font-normal text-white group-hover/tool:block group-focus-visible/tool:block">{tooltip}</span>
    </button>;
  };
  if (inLink && !linkOpen && floating) {
    const popover = <div ref={ref} role="toolbar" aria-label="Link" data-rich-toolbar data-puck-rte-menu
      style={floatingStyle}
      className="flex max-w-[min(420px,calc(100vw-24px))] items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1.5 text-xs text-zinc-800 shadow-lg">
      <span className="min-w-0 max-w-56 truncate px-1.5 text-zinc-500" title={linkLabel(editor, ui?.pages ?? [])}>
        {linkLabel(editor, ui?.pages ?? [])}
      </span>
      {button("Edit", requestLink)}
      {button("Open", openLink)}
      {button("Remove", removeLink)}
    </div>;
    return typeof document !== "undefined" ? createPortal(popover, document.body) : popover;
  }
  const palette = { ...DEFAULT_COLORS, ...library?.theme.colors };
  const toolbar = (
    <div ref={ref} role="toolbar" aria-label="Text formatting" data-rich-toolbar data-puck-rte-menu
      style={floating ? { ...floatingStyle, width: position?.width ?? "min(1180px, calc(100vw - 24px))", overflowY: position?.constrained ? "auto" : "visible" } : undefined}
      className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-800 shadow-lg">
      <div role="group" aria-label="Inline formatting" className={groupClass}>
      {button("Bold", () => { editor.chain().focus().toggleBold().run(); }, editor.isActive("bold"))}
      {button("Italic", () => { editor.chain().focus().toggleItalic().run(); }, editor.isActive("italic"))}
      {button("Underline", () => { editor.chain().focus().toggleUnderline().run(); }, editor.isActive("underline"))}
      {button("Strike", () => { editor.chain().focus().toggleStrike().run(); }, editor.isActive("strike"))}
      {button("Highlight", () => { appearance({ backgroundColor: editor.getAttributes("textAppearance").backgroundColor ? null : "#fef08a" }, false); },
        Boolean(editor.getAttributes("textAppearance").backgroundColor))}
      {button("Link", requestLink, editor.isActive("link"))}
      </div>
      <div role="group" aria-label="Typography" className={groupClass}>
      <select aria-label="Text style" className="h-8 max-w-24 rounded border border-zinc-200 p-1 text-xs" value=""
        onChange={(event) => {
          const value = event.target.value;
          const chain = editor.chain().focus();
          if (value === "quote") chain.setBlockquote().run();
          else {
            chain.unsetBlockquote();
            if (value.startsWith("h")) chain.setHeading({ level: Number(value[1]) as 1 | 2 | 3 | 4 }).run();
            else chain.setParagraph().run();
            if (value === "small") appearance({ fontSize: "14px" });
          }
        }}>
        <option value="" disabled>Style</option><option value="p">Paragraph</option>
        {[1, 2, 3, 4].map((n) => <option key={n} value={`h${n}`}>Heading {n}</option>)}
        <option value="small">Small</option><option value="quote">Quote</option>
      </select>
      <select aria-label="Font family" value="" className="h-8 max-w-28 rounded border border-zinc-200 p-1 text-xs"
        onChange={(event) => appearance({ fontFamily: event.target.value || null })}>
        <option value="">Theme font</option>
        {CURATED_FONTS.map((font) => <option key={font.name}>{font.name}</option>)}
      </select>
      <select aria-label="Font size" value="" className="h-8 w-14 rounded border border-zinc-200 p-1 text-xs"
        onChange={(event) => appearance({ fontSize: `${event.target.value}px` })}>
        <option value="" disabled>Size</option>
        {[12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96].map((n) => <option key={n}>{n}</option>)}
      </select>
      <details className="relative">
      <summary title="Text colors and custom size" aria-label="Text colors and custom size"
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md hover:bg-zinc-100 focus-visible:outline-2">
        <Palette size={15} aria-hidden="true" />
      </summary>
      <div className="flex w-60 flex-wrap gap-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg">
      <label className="flex items-center gap-1 text-xs">Custom
        <input aria-label="Custom font size" type="number" min={10} max={96} className="w-14 rounded border p-1"
          onBlur={(event) => { if (event.target.value) appearance({ fontSize: `${Math.min(96, Math.max(10, Number(event.target.value)))}px` }); }} />
      </label>
      <label className="flex items-center gap-1 text-xs">Color<input aria-label="Text color" type="color" defaultValue={palette.text}
        onChange={(event) => appearance({ color: event.target.value })} className="h-6 w-7" /></label>
      {Object.entries(palette).map(([name, color]) => <button key={name} type="button" aria-label={`${name} text color`}
        style={{ backgroundColor: color }} onMouseDown={(event) => event.preventDefault()}
        onClick={() => appearance({ color })} className="h-5 w-5 rounded-full border border-zinc-300" />)}
      <label className="flex items-center gap-1 text-xs">Highlight<input aria-label="Highlight" type="color" defaultValue="#fef08a"
        onChange={(event) => appearance({ backgroundColor: event.target.value }, false)} className="h-6 w-7" /></label>
      </div>
      </details>
      </div>
      <div role="group" aria-label="Paragraph formatting" className={groupClass}>
      <select aria-label="Text alignment" value="" className="h-8 rounded border border-zinc-200 p-1 text-xs" onChange={(event) => { editor.chain().focus().setTextAlign(event.target.value).run(); }}>
        <option value="" disabled>Align</option>
        {["left", "center", "right", "justify"].map((align) => <option key={align}>{align}</option>)}
      </select>
      <select aria-label="Line height" value="" className="h-8 rounded border border-zinc-200 p-1 text-xs" onChange={(event) => { editor.chain().focus().updateAttributes(block, { lineHeight: event.target.value }).run(); }}>
        <option value="" disabled>Line height</option>{[1, 1.2, 1.4, 1.5, 1.6, 1.8, 2, 2.5, 3].map((n) => <option key={n}>{n}</option>)}
      </select>
      {button("Bullets", () => { editor.chain().focus().toggleBulletList().run(); }, editor.isActive("bulletList"))}
      {button("Numbers", () => { editor.chain().focus().toggleOrderedList().run(); }, editor.isActive("orderedList"))}
      {button("Indent", () => {
        if (editor.isActive("listItem")) editor.chain().focus().sinkListItem("listItem").run();
        else editor.chain().focus().updateAttributes(block, { indent: Math.min(128, Number(editor.getAttributes(block).indent ?? 0) + 16) }).run();
      })}
      {button("Outdent", () => {
        if (editor.isActive("listItem")) editor.chain().focus().liftListItem("listItem").run();
        else editor.chain().focus().updateAttributes(block, { indent: Math.max(0, Number(editor.getAttributes(block).indent ?? 0) - 16) }).run();
      })}
      </div>
      <div role="group" aria-label="History and cleanup" className={groupClass}>
      {button("Undo", () => { editor.chain().focus().undo().run(); }, false, !editor.can().undo())}
      {button("Redo", () => { editor.chain().focus().redo().run(); }, false, !editor.can().redo())}
      {button("Clear formatting", () => { editor.chain().focus().unsetAllMarks().clearNodes().run(); })}
      </div>
      {ai && hasSelection ? button("Rewrite with AI", () => ai.openText(editor)) : null}
      {linkHint && !hasSelection && !inLink ? <p role="status" className="w-full border-t border-zinc-100 px-1 pt-2 text-xs text-zinc-500">Select text to add a link</p> : null}
      {linkOpen ? <div className="w-full border-t pt-2">
        <LinkPicker value={currentLink(editor)} autoFocus onApply={applyLink}
          onCancel={() => { linkSelection.current = null; setLinkOpen(false); editor.commands.focus(); }}
          onRemove={editor.isActive("link") ? removeLink : undefined} />
      </div> : null}
    </div>
  );
  return floating && typeof document !== "undefined" ? createPortal(toolbar, document.body) : toolbar;
}

/** The link under the cursor as a picker value: page id links stay typed. */
function currentLink(editor: Editor): LinkValue {
  const attrs = editor.getAttributes("link") as { href?: string; target?: string | null; rel?: string | null; pageId?: string | null };
  if (!attrs.href && !attrs.pageId) return "";
  const options = { ...(attrs.target === "_blank" ? { newTab: true } : {}), ...(/\bnofollow\b/.test(attrs.rel ?? "") ? { nofollow: true } : {}) };
  if (attrs.pageId) {
    const anchor = attrs.href?.split("#")[1];
    const link = parseSiteLink({ type: "page", pageId: attrs.pageId, ...(anchor ? { anchor } : {}), ...options });
    if (link) return link;
  }
  const href = attrs.href ?? "";
  if (/^https?:/i.test(href)) return { type: "url", url: href, ...options };
  return href;
}

function linkLabel(editor: Editor, pages: { id: string; slug: string; title: string | null }[]) {
  const link = currentLink(editor);
  const typed = parseSiteLink(link);
  if (typed?.type === "page") {
    const page = pages.find(({ id }) => id === typed.pageId);
    return page ? `/${page.slug}${typed.anchor ? `#${typed.anchor}` : ""}` : "Deleted page";
  }
  return typeof link === "string" ? link : resolveLink(link).href;
}
