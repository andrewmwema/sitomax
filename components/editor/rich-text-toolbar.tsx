"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { registerOverlayPortal } from "@puckeditor/core";
import { CURATED_FONTS, googleFontsUrl, isCuratedFont } from "@/lib/theme/fonts";
import { safeHref } from "@/lib/layout/guardrails";
import { DEFAULT_COLORS } from "@/lib/theme/presets";
import { SectionLibraryContext } from "./section-library";
import { appPoint, InteractionContext } from "./interaction-context";

export function RichTextToolbar({ editor, readOnly, floating = false }: {
  editor: Editor | null; readOnly: boolean; floating?: boolean;
}) {
  const ui = useContext(InteractionContext);
  const library = useContext(SectionLibraryContext);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const [newTab, setNewTab] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editor || !floating) return;
    const doc = editor.view.dom.ownerDocument;
    const measure = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty && !linkOpen) { setPosition(null); return; }
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const topPoint = appPoint(doc, start.left, Math.min(start.top, end.top));
      const bottomPoint = appPoint(doc, end.right, Math.max(start.bottom, end.bottom));
      const height = ref.current?.offsetHeight ?? 150;
      const width = Math.min(720, window.innerWidth - 24);
      const top = topPoint.y >= height + 12 ? topPoint.y - height - 8 : bottomPoint.y + 8;
      setPosition({ left: Math.max(12, Math.min(topPoint.x, window.innerWidth - width - 12)), top });
    };
    editor.on("selectionUpdate", measure);
    editor.on("transaction", measure);
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    doc.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("selectionUpdate", measure); editor.off("transaction", measure);
      observer.disconnect();
      doc.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true);
    };
  }, [editor, floating, linkOpen]);

  useEffect(() => registerOverlayPortal(ref.current), [editor, readOnly]);
  useEffect(() => {
    if (!editor) return;
    const doc = editor.view.dom.ownerDocument;
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k" || !editor.isFocused) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setHref(String(editor.getAttributes("link").href ?? ""));
      setNewTab(editor.getAttributes("link").target === "_blank");
      setLinkOpen(true);
    };
    doc.addEventListener("keydown", shortcut, true);
    return () => doc.removeEventListener("keydown", shortcut, true);
  }, [editor]);

  if (!editor || readOnly) return null;
  const appearance = (attrs: Record<string, string | null>) => {
    if (isCuratedFont(attrs.fontFamily)) {
      const doc = editor.view.dom.ownerDocument;
      const url = googleFontsUrl([attrs.fontFamily]);
      if (![...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some((link) => link.href === url)) {
        const link = doc.createElement("link"); link.rel = "stylesheet"; link.href = url; doc.head.appendChild(link);
      }
    }
    return editor.chain().focus().setMark("textAppearance", attrs).run();
  };
  const block = editor.isActive("heading") ? "heading" : editor.isActive("blockquote") ? "blockquote" : "paragraph";
  const button = (label: string, action: () => void, active = false, disabled = false) => (
    <button key={label} type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
      onMouseDown={(event) => event.preventDefault()} onClick={action}
      className={`rounded px-2 py-1 text-xs disabled:opacity-30 ${active ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}>{label}</button>
  );
  const palette = { ...DEFAULT_COLORS, ...library?.theme.colors };
  const toolbar = (
    <div ref={ref} role="toolbar" aria-label="Text formatting" data-rich-toolbar
      style={floating ? { position: "fixed", zIndex: 160, width: "min(720px, calc(100vw - 24px))", ...position, visibility: position ? "visible" : "hidden" } : undefined}
      className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-2 text-zinc-800 shadow-lg">
      {button("Bold", () => { editor.chain().focus().toggleBold().run(); }, editor.isActive("bold"))}
      {button("Italic", () => { editor.chain().focus().toggleItalic().run(); }, editor.isActive("italic"))}
      {button("Underline", () => { editor.chain().focus().toggleUnderline().run(); }, editor.isActive("underline"))}
      {button("Strike", () => { editor.chain().focus().toggleStrike().run(); }, editor.isActive("strike"))}
      <select aria-label="Text style" className="max-w-28 rounded border p-1 text-xs" value=""
        onChange={(event) => {
          const value = event.target.value;
          const chain = editor.chain().focus().unsetAllMarks();
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
      <select aria-label="Font family" value="" className="max-w-32 rounded border p-1 text-xs"
        onChange={(event) => appearance({ fontFamily: event.target.value || null })}>
        <option value="">Theme font</option>
        {CURATED_FONTS.map((font) => <option key={font.name}>{font.name}</option>)}
      </select>
      <select aria-label="Font size" value="" className="w-16 rounded border p-1 text-xs"
        onChange={(event) => appearance({ fontSize: `${event.target.value}px` })}>
        <option value="" disabled>Size</option>
        {[12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96].map((n) => <option key={n}>{n}</option>)}
      </select>
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
        onChange={(event) => appearance({ backgroundColor: event.target.value })} className="h-6 w-7" /></label>
      {button("Clear", () => { editor.chain().focus().unsetAllMarks().clearNodes().run(); })}
      {button("Link", () => { setHref(String(editor.getAttributes("link").href ?? "")); setNewTab(editor.getAttributes("link").target === "_blank"); setLinkOpen(!linkOpen); }, editor.isActive("link"))}
      <select aria-label="Text alignment" value="" className="rounded border p-1 text-xs" onChange={(event) => { editor.chain().focus().setTextAlign(event.target.value).run(); }}>
        <option value="" disabled>Align</option>
        {["left", "center", "right", "justify"].map((align) => <option key={align}>{align}</option>)}
      </select>
      <select aria-label="Line height" value="" className="rounded border p-1 text-xs" onChange={(event) => { editor.chain().focus().updateAttributes(block, { lineHeight: event.target.value }).run(); }}>
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
      {button("Undo", () => { editor.chain().focus().undo().run(); }, false, !editor.can().undo())}
      {button("Redo", () => { editor.chain().focus().redo().run(); }, false, !editor.can().redo())}
      {linkOpen ? <form className="flex w-full flex-wrap items-center gap-2 border-t pt-2 text-xs" onSubmit={(event) => {
        event.preventDefault();
        if (href && safeHref(href) === "#" && href !== "#") { setError("Use a page, anchor, https, mailto or tel link."); return; }
        if (href) editor.chain().focus().extendMarkRange("link").setLink({ href, target: newTab ? "_blank" : null, rel: "noopener noreferrer" }).run();
        else editor.chain().focus().unsetLink().run();
        setLinkOpen(false); setError("");
      }}>
        <input aria-label="Link URL" value={href} onChange={(event) => setHref(event.target.value)} className="min-w-36 flex-1 rounded border p-1" placeholder="https:// or /page" />
        <select aria-label="Link to page" value="" onChange={(event) => setHref(event.target.value)} className="max-w-36 rounded border p-1">
          <option value="">Choose page</option>{ui?.pages.map((page) => <option key={page.id} value={`/${page.slug}`}>{page.title || page.slug || "Home"}</option>)}
        </select>
        <label><input type="checkbox" checked={newTab} onChange={(event) => setNewTab(event.target.checked)} /> New tab</label>
        <button type="submit" className="rounded bg-zinc-900 px-2 py-1 text-white">Apply</button>
        <button type="button" onClick={() => setLinkOpen(false)}>Cancel</button>
        {error ? <p role="alert" className="w-full text-red-600">{error}</p> : null}
      </form> : null}
    </div>
  );
  return floating && typeof document !== "undefined" ? createPortal(toolbar, document.body) : toolbar;
}
