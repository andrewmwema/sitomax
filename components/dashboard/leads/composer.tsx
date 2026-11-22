"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Extension, Mark } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Underline } from "@tiptap/extension-underline";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import {
  ArrowUpRight, Baseline, Bold as BoldIcon, ChevronDown, Ellipsis, FileText, Italic as ItalicIcon, Link2, List, ListOrdered,
  LoaderCircle, Minimize2, Pencil, RemoveFormatting, Reply, Sparkles, TextQuote, Trash2, Type, Underline as UnderlineIcon, X,
} from "lucide-react";
import { draftLeadReply, saveLeadReplyTemplate, sendLeadReply } from "@/app/(dashboard)/dashboard/forms/reply-actions";
import { EmailLinkPicker } from "@/components/editor/link-picker";
import { linkHref } from "@/lib/links";
import type { LeadComposerConfig, LeadReplyTemplate } from "@/lib/leads/conversation";
import {
  applyLeadTemplate, cleanPastedReplyHtml, LEAD_SIGNATURE_MAX, leadPlaceholders, replyTextHtml,
} from "@/lib/leads/reply-content";
import { IconButton, MenuItem, Popover, leadToast, useStored, writeStored } from "./ui";

type After = "none" | "won" | "archive";
type Tone = "friendly" | "professional" | "brief" | "improve";
type Draft = { subject: string; html: string; signature: string; bcc: boolean; quote: boolean };
type Problem = { message: string; detail?: string; after: After };

const TextColor = Mark.create({
  name: "textColor",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.color || null,
        renderHTML: (attributes: { color?: string | null }) => attributes.color ? { style: `color: ${attributes.color}` } : {},
      },
    };
  },
  parseHTML() { return [{ tag: "span", getAttrs: (element) => (element as HTMLElement).style.color ? null : false }]; },
  renderHTML({ HTMLAttributes }) { return ["span", HTMLAttributes, 0]; },
});

/** Marks [bracketed placeholders] in the body so they are replaced before sending. */
const PlaceholderHighlight = Extension.create({
  name: "placeholderHighlight",
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          state.doc.descendants((node, position) => {
            for (const match of node.isText && node.text ? node.text.matchAll(/\[[^\]\n]{1,120}\]/g) : []) {
              decorations.push(Decoration.inline(position + match.index, position + match.index + match[0].length, { class: "leads-placeholder" }));
            }
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
    })];
  },
});

const extensions = [
  Document, Text, Paragraph, HardBreak, Bold, Italic, Underline, TextColor, BulletList, OrderedList, ListItem, Blockquote, UndoRedo,
  Link.configure({ openOnClick: false, autolink: false }), Placeholder.configure({ placeholder: "Write your reply…" }), PlaceholderHighlight,
];

export const leadDraftKey = (userId: string, leadId: string) => `sitomax:leads:draft:${userId}:${leadId}`;

function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const draft = value as Partial<Record<keyof Draft, unknown>>;
    return typeof draft.subject === "string" && typeof draft.html === "string" && typeof draft.signature === "string"
      ? { subject: draft.subject, html: draft.html, signature: draft.signature, bcc: draft.bcc === true, quote: draft.quote !== false } : null;
  } catch {
    return null;
  }
}

const noSubscription = () => () => {};

export function LeadComposer({ config }: { config: LeadComposerConfig }) {
  const key = leadDraftKey(config.userId, config.leadId);
  const raw = useStored(key);
  // Links in notification emails end in #reply and open the composer straight away.
  const requested = useSyncExternalStore(noSubscription, () => window.location.hash === "#reply", () => false);
  const [open, setOpen] = useState<boolean | null>(null);
  // A saved draft reopens the composer, once: clearing the text later must not collapse it.
  if (open === null && (raw !== null || requested)) setOpen(true);
  const recipient = config.firstName || config.to.name || config.to.email;

  if (!open) {
    return <button id="reply" type="button" data-lead-reply onClick={() => setOpen(true)}
      className="leads-card flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-[var(--lead-muted)] shadow-[0_2px_8px_rgb(21_24_41/5%)] hover:border-[#cfd5e6]">
      <Reply size={16} aria-hidden /><span className="min-w-0 flex-1 truncate">Reply to {recipient}…</span>
      {raw !== null ? <span className="leads-pill" data-status="contacted">Draft</span> : null}
    </button>;
  }
  return <ComposerPanel config={config} storageKey={key} initial={parseDraft(raw)} focus={open === true && raw === null}
    onClose={() => setOpen(false)} />;
}

function ComposerPanel({ config, storageKey, initial, focus, onClose }: {
  config: LeadComposerConfig; storageKey: string; initial: Draft | null; focus: boolean; onClose: () => void;
}) {
  const [subject, setSubject] = useState(initial?.subject ?? config.subject);
  const [signature, setSignature] = useState(initial?.signature ?? config.signature);
  const [bcc, setBcc] = useState(Boolean(initial?.bcc && config.bcc));
  const [quoteOn, setQuoteOn] = useState(initial?.quote ?? true);
  const [quoteOpen, setQuoteOpen] = useState(false);
  // Text is unknown until the editor has parsed the draft, so nothing is saved before then.
  const [content, setContent] = useState({ html: initial?.html ?? "", text: "", ready: false });
  const [formatting, setFormatting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [details, setDetails] = useState(config.admin);
  const [modal, setModal] = useState(false);
  const [working, setWorking] = useState<"send" | "ai" | "template" | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saved, setSaved] = useState(false);
  const [requestId, setRequestId] = useState<string>();
  const [templates, setTemplates] = useState(config.templates);
  const dialog = useRef<HTMLDialogElement>(null);
  const latest = useRef<Draft | null>(null);
  const busy = working !== null;

  const editor = useEditor({
    extensions, content: initial?.html ?? "", immediatelyRender: false,
    editorProps: {
      attributes: { role: "textbox", "aria-label": "Reply body", "aria-multiline": "true", class: "tiptap" },
      transformPastedHTML: cleanPastedReplyHtml,
    },
    onCreate: ({ editor }) => {
      setContent({ html: editor.getHTML(), text: editor.getText(), ready: true });
      if (focus) editor.commands.focus("end");
    },
    onUpdate: ({ editor }) => setContent({ html: editor.getHTML(), text: editor.getText(), ready: true }),
  });
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false, italic: editor?.isActive("italic") ?? false, underline: editor?.isActive("underline") ?? false,
      bullets: editor?.isActive("bulletList") ?? false, numbers: editor?.isActive("orderedList") ?? false,
      quote: editor?.isActive("blockquote") ?? false, link: editor?.isActive("link") ?? false,
      color: (editor?.getAttributes("textColor").color as string | undefined) ?? "",
    }),
  });

  const empty = !content.text.trim();
  const quote = quoteOn ? config.quote : null;
  const placeholders = leadPlaceholders(`${subject}\n${content.text}\n${signature}`);
  const untouched = empty && subject === config.subject && signature === config.signature && !bcc;

  // Drafts are kept in this browser, per lead, and restored when the lead is reopened.
  useEffect(() => {
    if (!content.ready) return;
    latest.current = untouched ? null : { subject, html: content.html, signature, bcc, quote: quoteOn };
    const timer = setTimeout(() => {
      writeStored(storageKey, latest.current ? JSON.stringify(latest.current) : null);
      setSaved(latest.current !== null);
    }, 600);
    return () => clearTimeout(timer);
  }, [bcc, content.html, content.ready, quoteOn, signature, storageKey, subject, untouched]);
  const settled = useRef(false);
  useEffect(() => () => {
    // Leaving the lead mid-sentence still keeps the latest text.
    if (!settled.current && latest.current) writeStored(storageKey, JSON.stringify(latest.current));
  }, [storageKey]);

  const finish = () => {
    settled.current = true;
    writeStored(storageKey, null);
    onClose();
  };
  const setBody = (html: string) => {
    if (!editor) return;
    if (editor.isEmpty) editor.commands.setContent(html);
    else editor.chain().focus("end").insertContent(html).run();
  };

  const send = async (after: After) => {
    if (!editor || busy || empty || placeholders.length) return;
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    setProblem(null);
    setWorking("send");
    try {
      const result = await sendLeadReply({
        leadId: config.leadId, requestId: id, subject, bcc, signature, quote: quote !== null, after,
        // An empty paragraph is how the editor stores a blank line; email clients collapse it without a break.
        html: editor.getHTML().replace(/<p><\/p>/g, "<p><br></p>"),
      });
      if (result.error !== undefined) {
        setProblem({ message: result.error, detail: result.detail, after });
        // Once a send was recorded, another attempt is a new message.
        if (result.reserved) setRequestId(undefined);
        return;
      }
      leadToast(result.warning ?? "Reply sent", result.warning ? "error" : "info");
      finish();
    } catch {
      setProblem({ message: "The reply could not be sent. Check your connection, then check the conversation before retrying.", after });
    } finally {
      setWorking(null);
    }
  };

  const draftWithAi = async (tone: Tone) => {
    if (!editor || busy) return;
    if (tone !== "improve" && !empty && !window.confirm("Replace what you have written with an AI draft?")) return;
    setProblem(null);
    setWorking("ai");
    try {
      const result = await draftLeadReply({ leadId: config.leadId, tone, draft: tone === "improve" ? editor.getText({ blockSeparator: "\n" }) : "" });
      if (result.error || !result.html) setProblem({ message: result.error ?? "Could not draft a reply.", after: "none" });
      else {
        editor.commands.setContent(result.html);
        editor.commands.focus("end");
        leadToast("Review this AI draft before sending.");
      }
    } catch {
      setProblem({ message: "Could not draft a reply. Check your connection and try again.", after: "none" });
    } finally {
      setWorking(null);
    }
  };

  const popOut = () => {
    const element = dialog.current;
    if (!element?.showModal) return;
    element.close();
    element.showModal();
    setModal(true);
    editor?.commands.focus();
  };
  const dock = () => {
    const element = dialog.current;
    if (!element) return;
    element.close();
    element.show();
    setModal(false);
    editor?.commands.focus();
  };
  const collapse = () => {
    if (modal) dialog.current?.close();
    onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key === "Enter") {
      event.preventDefault();
      void send("none");
    } else if (command && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setFormatting(true);
      setLinking(true);
    } else if (event.key === "Escape" && !modal && !event.defaultPrevented) {
      collapse();
    }
  };

  const recipient = config.to.name ? `${config.to.name} <${config.to.email}>` : config.to.email;
  const row = "flex min-h-10 items-center gap-2 border-b border-[var(--lead-line)] px-4 text-sm";
  const label = "shrink-0 text-[13px] text-[var(--lead-muted)]";

  return <dialog ref={dialog} open id="reply" aria-label={`Reply to ${config.to.name || config.to.email}`} className="leads-ui leads-composer"
    onKeyDown={onKeyDown} onCancel={(event) => { event.preventDefault(); dock(); }}
    // A browser may close a modal dialog on a repeated Escape; bring the reply back docked instead of losing it.
    onClose={(event) => {
      if (event.currentTarget.open) return;
      event.currentTarget.show();
      setModal(false);
    }}>
    <div className={row}>
      <span className={label}>To</span>
      <span className="min-w-0 truncate rounded-full bg-[#eef0f5] px-2.5 py-0.5 text-[13px] text-[var(--lead-navy)]">{recipient}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {config.bcc ? <button type="button" role="switch" aria-checked={bcc} onClick={() => setBcc(!bcc)}
          data-tip={`Send a copy to ${config.bcc.email}`} data-tip-align="end"
          className={`relative mr-1 flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${bcc ? "bg-[var(--lead-blue-soft)] text-[var(--lead-blue-strong)]" : "text-[var(--lead-muted)] hover:bg-[var(--lead-hover)]"}`}>
          <span aria-hidden className={`flex h-3.5 w-6 items-center rounded-full p-0.5 transition-colors ${bcc ? "bg-[var(--lead-blue)]" : "bg-[#c9cedb]"}`}>
            <span className={`size-2.5 rounded-full bg-white transition-transform ${bcc ? "translate-x-2.5" : ""}`} />
          </span>{config.bcc.mine ? "Bcc me" : "Bcc owner"}
        </button> : null}
        {modal ? <IconButton label="Dock reply" tipAlign="end" onClick={dock}><Minimize2 size={15} /></IconButton>
          : <IconButton label="Open in a larger window" tipAlign="end" onClick={popOut}><ArrowUpRight size={16} /></IconButton>}
        <IconButton label="Close reply (draft is kept)" tipAlign="end" onClick={collapse}><X size={16} /></IconButton>
      </span>
    </div>
    {details ? <div className="space-y-1 border-b border-[var(--lead-line)] bg-[#fafbfd] px-4 py-2.5 text-[13px]">
      <p className="break-all"><span className={label}>From </span>{config.details.from ?? "Not configured"}</p>
      <p className="break-all"><span className={label}>Reply-to </span>{config.details.replyTo || "Unavailable"}</p>
      <p className="text-xs text-[var(--lead-muted)]">{config.details.note} Addresses reflect current settings and may change before sending.</p>
    </div> : null}
    {config.details.problem ? <p role="status" className="border-b border-[#f0e2a6] bg-[#fffbea] px-4 py-2 text-[13px] text-[#6b5200]">{config.details.problem}</p> : null}
    <label className={row}>
      <span className={label}>Subject</span>
      <input value={subject} maxLength={200} disabled={busy} onChange={(event) => setSubject(event.target.value)}
        className="leads-bare min-w-0 flex-1 py-2 text-sm text-[var(--lead-navy)]" />
    </label>

    <div className="leads-composer-body">
      <EditorContent editor={editor} className="leads-rich leads-editor px-4 pt-3" />
      <div className="px-4 pb-3 pt-2">
        {signature ? <span aria-hidden className="block text-sm leading-normal text-[var(--lead-muted)]">--</span> : null}
        <textarea aria-label="Signature" value={signature} maxLength={LEAD_SIGNATURE_MAX} disabled={busy} rows={Math.max(1, signature.split("\n").length)}
          placeholder="No signature" onChange={(event) => setSignature(event.target.value)} className="leads-bare leads-signature" />
        {quote ? <>
          <button type="button" aria-expanded={quoteOpen} aria-label={quoteOpen ? "Hide quoted message" : "Show quoted message"} onClick={() => setQuoteOpen(!quoteOpen)}
            className="mt-2 flex h-5 w-8 items-center justify-center rounded-full bg-[#eceff6] text-[var(--lead-muted)] hover:bg-[#dfe3ee] hover:text-[var(--lead-navy)]">
            <Ellipsis size={16} aria-hidden />
          </button>
          {quoteOpen ? <div className="mt-2 border-l-2 border-[var(--lead-line)] pl-3 text-[13px] text-[var(--lead-muted)]">
            <p>{quote.header}</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{quote.text}</p>
            <button type="button" className="mt-2 text-xs font-medium text-[var(--lead-blue)] hover:underline" onClick={() => setQuoteOn(false)}>Remove quoted message</button>
          </div> : null}
        </> : null}
      </div>
    </div>

    {placeholders.length ? <p role="status" className="border-t border-[#f0e2a6] bg-[#fffbea] px-4 py-2 text-[13px] text-[#6b5200]">
      Replace before sending: {placeholders.map((value) => <mark key={value} className="leads-placeholder mr-1">{value}</mark>)}
    </p> : null}
    {problem ? <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#f0cfcb] bg-[#fdf3f2] px-4 py-2 text-[13px] text-[#96281f]">
      <p className="min-w-0 flex-1">{problem.message}{problem.detail ? <span className="mt-0.5 block font-mono text-xs opacity-80">{problem.detail}</span> : null}</p>
      {working === null && !empty ? <button type="button" className="leads-button" data-variant="danger" onClick={() => void send(problem.after)}>Retry</button> : null}
    </div> : null}
    {linking && editor ? <div className="border-t border-[var(--lead-line)] p-3"><EmailLinkPicker pages={config.pages} autoFocus
      value={(editor.getAttributes("link").href as string | undefined) ?? ""} onCancel={() => { setLinking(false); editor.commands.focus(); }}
      onRemove={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinking(false); }}
      onApply={(link) => {
        const href = linkHref(link, { pages: Object.fromEntries(config.pages.map((page) => [page.id, `${config.siteUrl}/${page.slug}`])) });
        if (href === "#") return;
        if (editor.state.selection.empty && !editor.isActive("link")) {
          editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
        } else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
        setLinking(false);
      }} /></div> : null}
    {formatting ? <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-t border-[var(--lead-line)] px-3 py-1.5">
      <Format label="Bold (Ctrl+B)" on={active?.bold} disabled={busy} run={() => editor?.chain().focus().toggleBold().run()}><BoldIcon size={15} /></Format>
      <Format label="Italic (Ctrl+I)" on={active?.italic} disabled={busy} run={() => editor?.chain().focus().toggleItalic().run()}><ItalicIcon size={15} /></Format>
      <Format label="Underline (Ctrl+U)" on={active?.underline} disabled={busy} run={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={15} /></Format>
      <Popover label="Text color" side="top" className="min-w-0" trigger={(props) => <IconButton label="Text color" tipSide="top" disabled={busy} {...props}>
        <Baseline size={16} style={active?.color ? { color: active.color } : undefined} /></IconButton>}>
        {(close) => <div className="grid grid-cols-4 gap-1">
          {config.palette.map((color) => <button key={color} type="button" role="menuitem" aria-label={`Text color ${color}`}
            onClick={() => { editor?.chain().focus().setMark("textColor", { color }).run(); close(false); }}
            className="flex size-8 items-center justify-center rounded-lg hover:bg-[var(--lead-hover)]">
            <span className="size-5 rounded-full border border-black/10" style={{ background: color }} /></button>)}
          <button type="button" role="menuitem" className="col-span-4 mt-1 rounded-lg px-2 py-1.5 text-left text-xs text-[var(--lead-body)] hover:bg-[var(--lead-hover)]"
            onClick={() => { editor?.chain().focus().unsetMark("textColor").run(); close(false); }}>Default color</button>
        </div>}
      </Popover>
      <span aria-hidden className="mx-1 h-5 w-px bg-[var(--lead-line)]" />
      <Format label="Bulleted list" on={active?.bullets} disabled={busy} run={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></Format>
      <Format label="Numbered list" on={active?.numbers} disabled={busy} run={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></Format>
      <Format label="Quote" on={active?.quote} disabled={busy} run={() => editor?.chain().focus().toggleBlockquote().run()}><TextQuote size={16} /></Format>
      <Format label="Link (Ctrl+K)" on={active?.link || linking} disabled={busy} run={() => setLinking(!linking)}><Link2 size={16} /></Format>
      <span aria-hidden className="mx-1 h-5 w-px bg-[var(--lead-line)]" />
      <Format label="Clear formatting" disabled={busy} run={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={16} /></Format>
    </div> : null}

    <div className="flex items-center gap-1 border-t border-[var(--lead-line)] px-3 py-2.5">
      <div className="mr-1 inline-flex">
        <button type="button" className="leads-button rounded-r-none px-4" data-variant="primary" disabled={busy || empty || placeholders.length > 0}
          onClick={() => void send("none")} data-tip="Send (Ctrl+Enter)" data-tip-side="top" data-tip-align="start">
          {working === "send" ? <><LoaderCircle size={14} className="animate-spin" aria-hidden />Sending…</> : "Send"}
        </button>
        <Popover label="Send options" side="top" trigger={(props) => <button type="button" aria-label="More send options" {...props}
          disabled={busy || empty || placeholders.length > 0} className="leads-button rounded-l-none border-l-white/30 px-1.5" data-variant="primary"><ChevronDown size={15} aria-hidden /></button>}>
          {(close) => <>
            <MenuItem onClick={() => { close(); void send("none"); }}>Send</MenuItem>
            <MenuItem onClick={() => { close(); void send("won"); }}>Send &amp; mark Won</MenuItem>
            <MenuItem onClick={() => { close(); void send("archive"); }}>Send &amp; archive</MenuItem>
          </>}
        </Popover>
      </div>
      <IconButton label="Formatting options" tipSide="top" aria-pressed={formatting} onClick={() => { setFormatting(!formatting); setLinking(false); }}><Type size={16} /></IconButton>
      <Popover label="Draft with AI" side="top" className="w-64" trigger={(props) => <IconButton label="Draft with AI" tipSide="top" disabled={busy} {...props}>
        {working === "ai" ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}</IconButton>}>
        {(close) => <>
          <p className="leads-menu-label">Draft with AI · 1 small credit</p>
          <MenuItem onClick={() => { close(); void draftWithAi("friendly"); }}>Friendly</MenuItem>
          <MenuItem onClick={() => { close(); void draftWithAi("professional"); }}>Professional</MenuItem>
          <MenuItem onClick={() => { close(); void draftWithAi("brief"); }}>Brief</MenuItem>
          <div className="leads-menu-rule" />
          <MenuItem disabled={empty} onClick={() => { close(); void draftWithAi("improve"); }}>Improve my draft</MenuItem>
          <p className="px-2.5 pb-1 pt-2 text-xs text-[var(--lead-muted)]">Uses the inquiry text. Write confidential replies yourself, and check every fact before sending.</p>
        </>}
      </Popover>
      <Popover label="Templates" role="dialog" side="top" className="w-80 p-0" trigger={(props) => <IconButton label="Templates" tipSide="top" disabled={busy} {...props}><FileText size={16} /></IconButton>}>
        {(close) => <TemplatePanel templates={templates} siteId={config.siteId} currentText={editor?.getText({ blockSeparator: "\n" }).trim() ?? ""}
          onSaved={setTemplates} onInsert={(template) => {
            setBody(replyTextHtml(applyLeadTemplate(template.body_text, { first_name: config.firstName || "[first name]", business_name: config.business })));
            close(false);
          }} />}
      </Popover>
      <Popover label="More options" side="top" trigger={(props) => <IconButton label="More options" tipSide="top" {...props}><Ellipsis size={16} /></IconButton>}>
        {(close) => <>
          <MenuItem role="menuitemcheckbox" aria-checked={details} onClick={() => { close(); setDetails(!details); }}>{details ? "Hide email details" : "Email details"}</MenuItem>
          {config.quote ? <MenuItem role="menuitemcheckbox" aria-checked={quoteOn} onClick={() => { close(); setQuoteOn(!quoteOn); }}>
            {quoteOn ? "Remove quoted message" : "Include quoted message"}</MenuItem> : null}
        </>}
      </Popover>
      <span className="ml-auto mr-1 text-xs text-[var(--lead-muted)]" aria-live="polite">{saved && !untouched ? "Draft saved" : ""}</span>
      <IconButton label="Discard draft" tipSide="top" tipAlign="end" disabled={busy} onClick={() => {
        if (untouched || window.confirm("Discard this draft? This cannot be undone.")) finish();
      }}><Trash2 size={16} /></IconButton>
    </div>
  </dialog>;
}

function Format({ label, on, disabled, run, children }: { label: string; on?: boolean; disabled: boolean; run: () => void; children: ReactNode }) {
  // Preventing the mouse-down default keeps the selection in the editor while a button is pressed.
  return <IconButton label={label} tipSide="top" aria-pressed={Boolean(on)} disabled={disabled}
    onMouseDown={(event) => event.preventDefault()} onClick={run}>{children}</IconButton>;
}

function TemplatePanel({ templates, siteId, currentText, onInsert, onSaved }: {
  templates: LeadReplyTemplate[]; siteId: string; currentText: string;
  onInsert: (template: LeadReplyTemplate) => void; onSaved: (templates: LeadReplyTemplate[]) => void;
}) {
  const [editing, setEditing] = useState<{ id?: string; name: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!editing || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await saveLeadReplyTemplate({ site: siteId, id: editing.id, name: editing.name, text: editing.text });
      if (result.error) { setError(result.error); return; }
      const name = editing.name.trim();
      const body_text = editing.text.trim();
      // New templates get their id on the next page load; until then the name identifies them here.
      onSaved([...templates.filter((template) => template.id !== editing.id && template.name !== name), { id: editing.id ?? `new:${name}`, name, body_text }]
        .sort((a, b) => a.name.localeCompare(b.name)));
      leadToast("Template saved.");
      setEditing(null);
    } catch {
      setError("Could not save the reply template.");
    } finally {
      setSaving(false);
    }
  };
  if (editing) {
    return <div className="space-y-2.5 p-3">
      <p className="text-[13px] font-semibold text-[var(--lead-navy)]">{editing.id ? "Edit template" : "Save as template"}</p>
      <label className="block text-xs text-[var(--lead-muted)]">Name
        <input autoFocus value={editing.name} maxLength={80} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="leads-input mt-1" /></label>
      <label className="block text-xs text-[var(--lead-muted)]">Text
        <textarea value={editing.text} maxLength={8000} rows={5} onChange={(event) => setEditing({ ...editing, text: event.target.value })} className="leads-input mt-1" /></label>
      <p className="text-xs text-[var(--lead-muted)]">Variables: {"{first_name}"} and {"{business_name}"}.</p>
      {error ? <p role="alert" className="text-xs text-[#96281f]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" className="leads-button" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>
        <button type="button" className="leads-button" data-variant="primary" disabled={saving || !editing.name.trim() || !editing.text.trim()} onClick={() => void save()}>
          {saving ? "Saving…" : "Save template"}</button>
      </div>
    </div>;
  }
  return <div>
    <p className="leads-menu-label px-3 pt-3">Templates</p>
    {templates.length ? <ul className="max-h-56 overflow-y-auto px-1.5">
      {templates.map((template) => <li key={template.id} className="flex items-center gap-1">
        <button type="button" className="leads-menu-item min-w-0 flex-1" onClick={() => onInsert(template)}><span className="truncate">{template.name}</span></button>
        {template.id.startsWith("new:") ? null : <IconButton label={`Edit ${template.name}`} tipAlign="end" tipSide="top" className="size-7"
          onClick={() => setEditing({ id: template.id, name: template.name, text: template.body_text })}><Pencil size={13} /></IconButton>}
      </li>)}
    </ul> : <p className="px-3 pb-2 text-[13px] text-[var(--lead-muted)]">No templates yet. Save a reply you send often to reuse it.</p>}
    <div className="border-t border-[var(--lead-line)] p-1.5">
      <button type="button" className="leads-menu-item" onClick={() => setEditing({ name: "", text: currentText })}>Save current reply as a template…</button>
    </div>
  </div>;
}
