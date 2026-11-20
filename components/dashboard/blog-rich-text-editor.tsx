"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { Text } from "@tiptap/extension-text";
import { TextAlign } from "@tiptap/extension-text-align";
import { Underline } from "@tiptap/extension-underline";
import { Placeholder } from "@tiptap/extensions";
import { blogLinkSchema } from "@/lib/blog";
import { sanitizeRichText } from "@/lib/richtext";
import { editorTextExtensions } from "@/lib/puck/richtext-extensions";

export type BlogTextSelection = { text: string; replace: (replacement: string) => boolean };

function captureSelection(editor: Editor): BlogTextSelection | null {
  const { doc, selection: { from, to } } = editor.state;
  const text = doc.textBetween(from, to, "\n", "\n");
  if (!text.trim()) return null;
  return {
    text,
    replace(replacement) {
      if (editor.isDestroyed || !editor.state.doc.eq(doc)) return false;
      const marks = doc.resolve(from).marks().map((mark) => mark.toJSON());
      const content = replacement.split(/\r?\n/).flatMap((line, index) => [
        ...(index ? [{ type: "hardBreak" }] : []),
        ...(line ? [{ type: "text", text: line, marks }] : []),
      ]);
      return content.length > 0 && editor.commands.insertContentAt({ from, to }, content);
    },
  };
}

const tools = [
  { label: "Bold", mark: "bold", run: (editor: Editor) => editor.chain().focus().toggleBold().run() },
  { label: "Italic", mark: "italic", run: (editor: Editor) => editor.chain().focus().toggleItalic().run() },
  { label: "Underline", mark: "underline", run: (editor: Editor) => editor.chain().focus().toggleUnderline().run() },
  { label: "Strikethrough", mark: "strike", run: (editor: Editor) => editor.chain().focus().toggleStrike().run() },
  { label: "Bullets", mark: "bulletList", run: (editor: Editor) => editor.chain().focus().toggleBulletList().run() },
  { label: "Numbered list", mark: "orderedList", run: (editor: Editor) => editor.chain().focus().toggleOrderedList().run() },
  { label: "Quote", mark: "blockquote", run: (editor: Editor) => editor.chain().focus().toggleBlockquote().run() },
] as const;

const extensions = [
  Document, Text, Paragraph, Bold, Italic, Underline, Strike, HardBreak, Blockquote, BulletList, OrderedList, ListItem,
  Heading.configure({ levels: [1, 2, 3, 4] }), TextAlign.configure({ types: ["paragraph", "heading"] }),
  Link.configure({
    openOnClick: false, autolink: false, linkOnPaste: false,
    isAllowedUri: (url, context) => context.defaultValidate(url) && blogLinkSchema.safeParse(url).success,
    HTMLAttributes: { target: null, rel: null },
  }),
  Placeholder.configure({ placeholder: "Write your post here…" }),
  ...editorTextExtensions,
];

export function BlogRichTextEditor({ html, onChange, onSelection, onRewrite, onSlash, selected }: {
  html: string; onChange: (html: string) => void; onSelection: (selection: BlogTextSelection | null) => void;
  onRewrite: () => void; onSlash: () => void; selected: boolean;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const [initialHtml] = useState(() => sanitizeRichText(html));
  const linkSelection = useRef<{ from: number; to: number; doc: Editor["state"]["doc"] } | null>(null);
  const latest = useRef({ onChange, onSelection, onSlash });
  useEffect(() => { latest.current = { onChange, onSelection, onSlash }; }, [onChange, onSelection, onSlash]);

  function openLink(editor: Editor) {
    if (editor.isActive("link") && editor.state.selection.empty) editor.commands.extendMarkRange("link");
    const { from, to } = editor.state.selection;
    linkSelection.current = { from, to, doc: editor.state.doc };
    const href = editor.getAttributes("link").href;
    setLink(typeof href === "string" ? href : "");
    setLinkError("");
    setLinkOpen(true);
  }

  const editor = useEditor({
    extensions, content: initialHtml, immediatelyRender: false,
    editorProps: { attributes: {
      role: "textbox", "aria-label": "Post body text", "aria-multiline": "true",
      class: "rich-text min-h-28 break-words p-3 text-base leading-7 outline-none",
    } },
    onUpdate: ({ editor }) => {
      latest.current.onChange(editor.getHTML());
      latest.current.onSelection(captureSelection(editor));
    },
    onSelectionUpdate: ({ editor }) => latest.current.onSelection(captureSelection(editor)),
  });
  const formatting = useEditorState({ editor, selector: ({ editor }) => ({
    marks: tools.map(({ mark }) => editor?.isActive(mark) ?? false),
    heading: [1, 2, 3, 4].find((level) => editor?.isActive("heading", { level })) ?? 0,
    link: editor?.isActive("link") ?? false,
  }) });
  const lastChange = useRef(html);
  useEffect(() => {
    if (!editor || html === lastChange.current) return;
    lastChange.current = html;
    if (html !== editor.getHTML()) editor.commands.setContent(sanitizeRichText(html), { emitUpdate: false });
  }, [editor, html]);

  function saveLink(event: FormEvent) {
    event.preventDefault();
    if (!editor || !linkSelection.current) return;
    const { from, to, doc } = linkSelection.current;
    if (!editor.state.doc.eq(doc)) {
      setLinkError("The text changed. Reopen the link editor and try again.");
      return;
    }
    const parsed = blogLinkSchema.safeParse(link);
    if (!parsed.success) { setLinkError("Enter a safe URL or a path starting with /."); return; }
    const command = editor.chain().focus().setTextSelection({ from, to });
    const saved = (from === to
      ? command.insertContent({ type: "text", text: parsed.data, marks: [{ type: "link", attrs: { href: parsed.data } }] })
      : command.setLink({ href: parsed.data })).run();
    if (saved) setLinkOpen(false);
    else setLinkError("Could not save this link. Select the text again and retry.");
  }

  const control = "rounded px-2 py-1 text-xs font-medium hover:bg-zinc-100 aria-pressed:bg-[#E9E6FF] aria-pressed:text-[#3025B8] disabled:opacity-50";
  return <div className="rounded-lg border border-zinc-200 focus-within:border-[#C8C3FF]">
    <div role="group" aria-label="Text formatting" className="flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-zinc-50 p-1.5">
      <select aria-label="Text style" value={formatting?.heading ?? 0} disabled={!editor} className={`${control} bg-white`}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "0") editor?.chain().focus().setParagraph().run();
          else if (value === "2" || value === "3" || value === "4") {
            editor?.chain().focus().setHeading({ level: value === "2" ? 2 : value === "3" ? 3 : 4 }).run();
          }
        }}>
        <option value="0">Paragraph</option>
        {formatting?.heading === 1 ? <option value="1" disabled>Heading 1</option> : null}
        <option value="2">Heading 2</option><option value="3">Heading 3</option><option value="4">Heading 4</option>
      </select>
      {tools.map(({ label, run }, index) => <button key={label} type="button" className={control} disabled={!editor}
        aria-pressed={formatting?.marks[index] ?? false} onMouseDown={(event) => event.preventDefault()}
        onClick={() => { if (editor) run(editor); }}>{label}</button>)}
      <button type="button" className={control} disabled={!editor} aria-pressed={formatting?.link ?? false}
        onMouseDown={(event) => event.preventDefault()} onClick={() => { if (editor) openLink(editor); }}>Link</button>
      <button type="button" className={control} disabled={!formatting?.link} onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().extendMarkRange("link").unsetLink().run()}>Unlink</button>
      <button type="button" className={control} disabled={!editor} onClick={() => editor?.chain().focus().undo().run()}>Undo</button>
      <button type="button" className={control} disabled={!editor} onClick={() => editor?.chain().focus().redo().run()}>Redo</button>
    </div>
    {linkOpen ? <form onSubmit={saveLink} className="flex flex-wrap items-end gap-2 border-b border-zinc-200 p-2">
      <label className="min-w-32 flex-1 text-xs">Link URL
        <input autoFocus value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://… or /contact"
          className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1" />
      </label>
      <button type="submit" className="platform-button">Save link</button>
      <button type="button" onClick={() => { setLinkOpen(false); editor?.commands.focus(); }} className="platform-button">Cancel</button>
      {linkError ? <p role="alert" className="basis-full text-xs text-red-700">{linkError}</p> : null}
    </form> : null}
    <EditorContent editor={editor} className="[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-zinc-400 [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"
      onKeyDown={(event) => {
        if (!editor || event.nativeEvent.isComposing) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openLink(editor); }
        if (event.key === "/" && editor.isEmpty) { event.preventDefault(); latest.current.onSlash(); }
      }} />
    {selected ? <button type="button" onClick={onRewrite} className="mx-3 mb-2 text-xs text-[#4B3FE0] underline">Rewrite selection</button> : null}
  </div>;
}
