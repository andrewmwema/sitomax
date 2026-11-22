"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Document } from "@tiptap/extension-document";
import { Text } from "@tiptap/extension-text";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Bold } from "@tiptap/extension-bold";
import { Italic } from "@tiptap/extension-italic";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Link } from "@tiptap/extension-link";
import { draftLeadReply, saveLeadReplyTemplate, sendLeadReply } from "@/app/(dashboard)/dashboard/forms/reply-actions";
import { EmailLinkPicker } from "@/components/editor/link-picker";
import type { EditorPageLink } from "@/components/editor/interaction-context";
import { linkHref } from "@/lib/links";
import { applyLeadTemplate, leadPlaceholders, replyTextHtml } from "@/lib/leads/reply-content";

export type LeadReplyTemplate = { id: string; name: string; body_text: string };
const extensions = [Document, Text, Paragraph, Bold, Italic, HardBreak, Link.configure({ openOnClick: false, autolink: false })];

export function LeadReplyComposer({ leadId, siteId, to, business, firstName, signature, siteUrl, canCopy, templates, pages }: {
  leadId: string; siteId: string; to: string; business: string; firstName: string;
  signature: string; siteUrl: string; canCopy: boolean; templates: LeadReplyTemplate[]; pages: EditorPageLink[];
}) {
  const [subject, setSubject] = useState(`Re: your inquiry to ${business}`);
  const [body, setBody] = useState("");
  const [bcc, setBcc] = useState(false);
  const [tone, setTone] = useState<"friendly" | "professional" | "brief">("friendly");
  const [templateId, setTemplateId] = useState("");
  const [editing, setEditing] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const [problemDetail, setProblemDetail] = useState("");
  const [notice, setNotice] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const [busy, start] = useTransition();
  const subjectInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (window.location.hash !== "#reply") return;
    const frame = requestAnimationFrame(() => subjectInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const editor = useEditor({
    extensions, immediatelyRender: false, editable: true,
    editorProps: { attributes: { role: "textbox", "aria-label": "Reply body", "aria-multiline": "true", class: "rich-text min-h-28 break-words p-3 outline-none" } },
    onUpdate: ({ editor }) => setBody(editor.getText()),
  });
  const placeholders = leadPlaceholders(`${subject}\n${body}`);
  const current = templates.find((template) => template.id === templateId);
  function run(action: () => Promise<void>) {
    setProblem(""); setProblemDetail(""); setNotice("");
    start(async () => { try { await action(); } catch { setProblem("The request could not be completed. Refresh the conversation before retrying."); } });
  }
  function setContent(html: string) {
    if (!editor) return;
    editor.commands.setContent(html);
    setBody(editor.getText());
  }

  return <section id="reply" className="space-y-3">
    <h3 className="text-sm font-semibold">Reply by email</h3>
    <div className="text-sm"><span className="font-medium">To:</span> <span className="break-all">{to}</span></div>
    <label className="block text-sm">Subject<input ref={subjectInput} value={subject} maxLength={200} disabled={busy}
      onChange={(event) => setSubject(event.target.value)} className="mt-1 block w-full border px-3" /></label>
    <div className="rounded-lg border border-[var(--platform-line)]">
      <div className="flex flex-wrap gap-2 border-b border-[var(--platform-line)] p-2" role="group" aria-label="Reply formatting">
        <button type="button" className="platform-button" disabled={!editor || busy} onClick={() => editor?.chain().focus().toggleBold().run()}>Bold</button>
        <button type="button" className="platform-button" disabled={!editor || busy} onClick={() => editor?.chain().focus().toggleItalic().run()}>Italic</button>
        <button type="button" className="platform-button" disabled={!editor || busy} onMouseDown={(event) => event.preventDefault()} onClick={() => setLinkOpen(true)}>Link Picker</button>
      </div>
      {linkOpen && editor ? <div className="border-b border-[var(--platform-line)] p-2"><EmailLinkPicker pages={pages}
        value={editor.getAttributes("link").href ?? ""} onCancel={() => setLinkOpen(false)}
        onRemove={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkOpen(false); }}
        onApply={(link) => {
          const href = linkHref(link, { pages: Object.fromEntries(pages.map((page) => [page.id, `${siteUrl}/${page.slug}`])) });
          if (href === "#") return;
          if (editor.state.selection.empty && !editor.isActive("link")) editor.chain().focus().insertContent({
            type: "text", text: href, marks: [{ type: "link", attrs: { href } }],
          }).run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
          setLinkOpen(false);
        }} /></div> : null}
      <EditorContent editor={editor} />
    </div>
    {placeholders.length ? <div role="status" className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
      Replace before sending: {placeholders.map((value) => <mark key={value} className="mr-1 rounded bg-amber-100 px-1">{value}</mark>)}
    </div> : null}
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">Tone<select value={tone} onChange={(event) => {
        const value = event.target.value;
        if (value === "friendly" || value === "professional" || value === "brief") setTone(value);
      }} className="ml-1 border px-2">
        <option value="friendly">Friendly</option><option value="professional">Professional</option><option value="brief">Brief</option>
      </select></label>
      <button type="button" className="platform-button" disabled={busy || !editor || Boolean(body.trim())} onClick={() => run(async () => {
        const result = await draftLeadReply({ leadId, tone });
        if (result.error) setProblem(result.error);
        else if (result.html) { setContent(result.html); setNotice("Review this AI draft before sending."); }
      })}>Draft reply · 1 small credit</button>
      <p className="basis-full text-xs text-[var(--platform-muted)]">Drafting uses the inquiry text. For confidential inquiries, write the reply yourself. Review any facts before sending.</p>
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">Template<select value={templateId} onChange={(event) => { setTemplateId(event.target.value); setEditing(false); }} className="ml-1 max-w-48 border px-2">
        <option value="">New template</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
      </select></label>
      <button type="button" className="platform-button" disabled={!current || !editor || busy || Boolean(body.trim())} onClick={() => {
        if (current) setContent(replyTextHtml(applyLeadTemplate(current.body_text, { first_name: firstName || "[first name]", business_name: business })));
      }}>Use template</button>
      <button type="button" className="platform-button" onClick={() => {
        setTemplateName(current?.name ?? ""); setTemplateText(current?.body_text ?? body); setEditing(!editing);
      }}>{current ? "Edit template" : "Create template"}</button>
    </div>
    {editing ? <div className="space-y-2 rounded border border-[var(--platform-line)] p-3">
      <label className="block text-xs">Template name<input value={templateName} maxLength={80}
        onChange={(event) => setTemplateName(event.target.value)} className="mt-1 block w-full border px-2" /></label>
      <label className="block text-xs">Template text<textarea value={templateText} maxLength={8000} rows={4}
        onChange={(event) => setTemplateText(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
      <p className="text-xs text-[var(--platform-muted)]">Variables: {"{first_name}"} and {"{business_name}"}.</p>
      <button type="button" className="platform-button" disabled={busy} onClick={() => run(async () => {
        const result = await saveLeadReplyTemplate({ site: siteId, id: current?.id, name: templateName, text: templateText });
        if (result.error) setProblem(result.error);
        else { setNotice("Template saved."); setEditing(false); }
      })}>Save template</button>
    </div> : null}
    <p className="whitespace-pre-wrap text-xs text-[var(--platform-muted)]">Signature added automatically:{"\n"}{signature}</p>
    {canCopy ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bcc} onChange={(event) => setBcc(event.target.checked)} /> Send me a copy (BCC account owner)</label> : null}
    <button type="button" className="platform-button platform-button-primary" disabled={busy || !body.trim() || Boolean(placeholders.length)}
      onClick={() => run(async () => {
        const id = requestId ?? crypto.randomUUID();
        setRequestId(id);
        const result = await sendLeadReply({ leadId, requestId: id, subject, html: editor?.getHTML() ?? "", bcc });
        if (result.error) { setProblem(result.error); setProblemDetail("detail" in result && typeof result.detail === "string" ? result.detail : "");
          if (result.reserved) setRequestId(undefined); }
        else { setNotice(result.success ?? "Reply submitted."); setContent(""); setRequestId(undefined); setBcc(false); }
      })}>{busy ? "Working…" : "Send reply"}</button>
    {problem ? <p role="alert" className="text-sm text-[var(--platform-error)]">{problem}</p> : null}
    {problemDetail ? <p role="note" className="whitespace-pre-wrap break-words text-xs text-[var(--platform-muted)]">{problemDetail}</p> : null}
    {notice ? <p role="status" className="text-sm text-[var(--platform-success)]">{notice}</p> : null}
  </section>;
}
