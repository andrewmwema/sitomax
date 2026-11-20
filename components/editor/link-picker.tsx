"use client";

import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { FileText, Hash, Link2, Mail, Phone, Search, StickyNote, Upload } from "lucide-react";
import { listSiteFiles, prepareFileUpload } from "@/app/editor/[pageId]/file-actions";
import { createClient } from "@/lib/supabase/client";
import {
  describeLink, normalizeAnchor, normalizeEmail, normalizeExternalUrl, normalizePhone, pageSections, parseSiteLink,
  suggestAnchor, type LinkType, type LinkValue, type PageSection, type SiteLink,
} from "@/lib/links";
import { EditorSiteContext } from "./image-upload-field";
import { InteractionContext, type EditorPageLink } from "./interaction-context";

const usePuckStore = createUsePuck();
const control = "w-full rounded-lg border border-[#E8E7E3] bg-white px-2.5 py-1.5 text-sm focus:outline-2 focus:outline-[#4B3FE0]";
const TYPES: { type: LinkType; label: string; icon: React.ReactNode }[] = [
  { type: "page", label: "Page", icon: <StickyNote size={14} /> },
  { type: "anchor", label: "Section", icon: <Hash size={14} /> },
  { type: "url", label: "URL", icon: <Link2 size={14} /> },
  { type: "email", label: "Email", icon: <Mail size={14} /> },
  { type: "phone", label: "Phone", icon: <Phone size={14} /> },
  { type: "file", label: "File", icon: <FileText size={14} /> },
];

type Draft = {
  type: LinkType; pageId: string; anchor: string; url: string; email: string; subject: string; phone: string;
  fileUrl: string; fileName: string; newTab: boolean; nofollow: boolean;
};

/** Maps a stored link (typed or legacy string) onto the picker form. */
export function linkDraft(value: LinkValue, pages: Pick<EditorPageLink, "id" | "slug">[]): Draft {
  const draft: Draft = { type: "page", pageId: "", anchor: "", url: "", email: "", subject: "", phone: "", fileUrl: "", fileName: "", newTab: false, nofollow: false };
  const typed = parseSiteLink(value);
  if (typed) {
    const base = { ...draft, type: typed.type, newTab: typed.newTab === true, nofollow: typed.nofollow === true };
    switch (typed.type) {
      case "page": return { ...base, pageId: typed.pageId, anchor: typed.anchor ?? "" };
      case "anchor": return { ...base, anchor: typed.anchor };
      case "url": return { ...base, url: typed.url };
      case "email": return { ...base, email: typed.email, subject: typed.subject ?? "" };
      case "phone": return { ...base, phone: typed.phone };
      case "file": return { ...base, fileUrl: typed.url, fileName: typed.name ?? "" };
    }
  }
  if (typeof value !== "string" || !value.trim()) return draft;
  const text = value.trim();
  if (text.startsWith("#")) return { ...draft, type: "anchor", anchor: normalizeAnchor(text) };
  if (/^mailto:/i.test(text)) {
    const [address, query = ""] = text.slice(7).split("?");
    return { ...draft, type: "email", email: decodeURIComponent(address), subject: new URLSearchParams(query).get("subject") ?? "" };
  }
  if (/^tel:/i.test(text)) return { ...draft, type: "phone", phone: text.slice(4) };
  if (text.startsWith("/") && !text.startsWith("//")) {
    const [path, anchor = ""] = text.split("#");
    const slug = decodeURIComponent(path.split("?")[0].replace(/^\/+|\/+$/g, ""));
    const page = pages.find((candidate) => candidate.slug === slug);
    return { ...draft, type: "page", pageId: page?.id ?? "", anchor: normalizeAnchor(anchor) };
  }
  return { ...draft, type: "url", url: text, newTab: true };
}

/** Builds and validates the typed link; returns an error message when invalid. */
export function buildLink(draft: Draft): SiteLink | string {
  const options = { ...(draft.newTab ? { newTab: true } : {}), ...(draft.nofollow ? { nofollow: true } : {}) };
  switch (draft.type) {
    case "page":
      if (!draft.pageId) return "Choose a page.";
      return { type: "page", pageId: draft.pageId, ...(draft.anchor ? { anchor: normalizeAnchor(draft.anchor) } : {}), ...options };
    case "anchor": {
      const anchor = normalizeAnchor(draft.anchor);
      return anchor ? { type: "anchor", anchor, ...options } : "Choose a section.";
    }
    case "url": {
      const url = normalizeExternalUrl(draft.url);
      return url ? { type: "url", url, ...options } : "Enter a web address starting with http:// or https://.";
    }
    case "email": {
      const email = normalizeEmail(draft.email);
      if (!email) return "Enter a valid email address.";
      const subject = draft.subject.trim().slice(0, 200);
      return { type: "email", email, ...(subject ? { subject } : {}), ...options };
    }
    case "phone": {
      const phone = normalizePhone(draft.phone);
      return phone ? { type: "phone", phone, ...options } : "Enter a phone number using digits, spaces or +.";
    }
    case "file": {
      const url = normalizeExternalUrl(draft.fileUrl);
      return url ? { type: "file", url, ...(draft.fileName ? { name: draft.fileName.slice(0, 255) } : {}), ...options } : "Choose a file.";
    }
  }
}

/** Live sections of the open page, plus a way to give one an anchor ID. */
function useCurrentSections() {
  const content = usePuckStore((state) => state.appState.data.content);
  const getPuck = useGetPuck();
  const sections = useMemo(() => pageSections({ content }), [content]);
  const assignAnchor = (section: PageSection) => {
    if (section.anchor) return section.anchor;
    const anchor = suggestAnchor(section.label, sections.flatMap(({ anchor: taken }) => taken ? [taken] : []));
    getPuck().dispatch({ type: "setData", data: (previous) => ({
      content: previous.content.map((item, index) => {
        if (index !== section.index) return item;
        const design = (item.props.design ?? {}) as { settings?: Record<string, unknown> };
        return { ...item, props: { ...item.props, design: { ...design, settings: { ...design.settings, anchorId: anchor } } } };
      }),
    }) });
    return anchor;
  };
  return { sections, assignAnchor };
}

type LinkPickerProps = {
  value: LinkValue; onApply: (link: SiteLink) => void; onCancel: () => void; onRemove?: () => void; autoFocus?: boolean;
};

export function LinkPicker(props: LinkPickerProps) {
  const current = useCurrentSections();
  return <LinkPickerFields {...props} current={current} />;
}

export function EmailLinkPicker(props: LinkPickerProps & { pages: EditorPageLink[] }) {
  return <LinkPickerFields {...props} emailPages={props.pages} />;
}

function LinkPickerFields({ value, onApply, onCancel, onRemove, autoFocus = false, current, emailPages }: LinkPickerProps & {
  current?: ReturnType<typeof useCurrentSections>; emailPages?: EditorPageLink[];
}) {
  const id = useId();
  const ui = useContext(InteractionContext);
  const pages = useMemo(() => emailPages ?? ui?.pages ?? [], [emailPages, ui?.pages]);
  const [draft, setDraft] = useState(() => linkDraft(value || (emailPages ? "https://" : ""), pages));
  const [error, setError] = useState("");
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (autoFocus) first.current?.focus(); }, [autoFocus]);
  const set = (patch: Partial<Draft>) => { setDraft((previous) => ({ ...previous, ...patch })); setError(""); };
  const external = draft.type === "url" || draft.type === "file";
  const targetSections = current && (draft.type === "anchor" || draft.pageId === ui?.pageId)
    ? current.sections : pages.find((page) => page.id === draft.pageId)?.sections ?? [];
  const chooseSection = (anchor: string) => {
    const section = targetSections.find((candidate) => candidate.anchor === anchor || candidate.id === anchor);
    if (!section) return set({ anchor: "" });
    const onThisPage = draft.type === "anchor" || draft.pageId === ui?.pageId;
    set({ anchor: section.anchor ?? (onThisPage ? current?.assignAnchor(section) ?? "" : "") });
  };

  const apply = () => {
    const link = buildLink(draft);
    if (typeof link === "string") { setError(link); return; }
    onApply(link);
  };

  return <div className="platform-ui flex flex-col gap-3 text-xs text-[#3D3C39]" onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); onCancel(); }
    if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type !== "checkbox") { event.preventDefault(); apply(); }
  }}>
    <div role="radiogroup" aria-label="Link type" className="grid grid-cols-3 gap-1">
      {TYPES.filter(({ type }) => !emailPages || (type !== "anchor" && type !== "file")).map(({ type, label, icon }, index) => <button key={type} ref={index === 0 ? first : undefined} type="button" role="radio"
        aria-checked={draft.type === type} onClick={() => { if (type !== draft.type) set({ type, newTab: type === "url" || type === "file", nofollow: false }); }}
        className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 font-medium transition ${draft.type === type
          ? "border-[#4B3FE0] bg-[#F1EFFF] text-[#4B3FE0]" : "border-[#E8E7E3] bg-white hover:bg-[#F7F7F5]"}`}>{icon}{label}</button>)}
    </div>

    {draft.type === "page" ? <>
      <label className="flex flex-col gap-1" htmlFor={`${id}-page`}>Page
        <select id={`${id}-page`} className={control} value={draft.pageId} onChange={(event) => set({ pageId: event.target.value, anchor: "" })}>
          <option value="">Choose a page…</option>
          {pages.map((page) => <option key={page.id} value={page.id}>{page.title || (page.slug ? `/${page.slug}` : "Home")}{page.slug ? ` (/${page.slug})` : " (homepage)"}</option>)}
        </select>
      </label>
      {draft.pageId ? <SectionSelect id={`${id}-section`} label="Section (optional)" sections={targetSections} anchor={draft.anchor}
        canAssign={draft.pageId === ui?.pageId} optional onChange={chooseSection} /> : null}
    </> : null}
    {draft.type === "anchor" && current ? <SectionSelect id={`${id}-section`} label="Section on this page" sections={current.sections}
      anchor={draft.anchor} canAssign onChange={chooseSection} /> : null}
    {draft.type === "url" ? <label className="flex flex-col gap-1">Web address
      <input className={control} value={draft.url} inputMode="url" placeholder="example.com/page" onChange={(event) => set({ url: event.target.value })}
        onBlur={() => { const url = normalizeExternalUrl(draft.url); if (url) set({ url }); }} />
    </label> : null}
    {draft.type === "email" ? <>
      <label className="flex flex-col gap-1">Email address
        <input className={control} type="email" value={draft.email} placeholder="hello@example.com" onChange={(event) => set({ email: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1">Subject (optional)
        <input className={control} value={draft.subject} maxLength={200} onChange={(event) => set({ subject: event.target.value })} />
      </label>
    </> : null}
    {draft.type === "phone" ? <label className="flex flex-col gap-1">Phone number
      <input className={control} type="tel" value={draft.phone} placeholder="+1 555 123 4567" onChange={(event) => set({ phone: event.target.value })}
        onBlur={() => { const phone = normalizePhone(draft.phone); if (phone) set({ phone }); }} />
    </label> : null}
    {draft.type === "file" ? <FileChooser selected={draft.fileUrl} onSelect={(fileUrl, fileName) => set({ fileUrl, fileName })} /> : null}

    <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
      <legend className="sr-only">Link options</legend>
      <label className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={draft.newTab} onChange={(event) => set({ newTab: event.target.checked })} />Open in new tab</label>
      {external ? <label className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={draft.nofollow} onChange={(event) => set({ nofollow: event.target.checked })} />nofollow</label> : null}
    </fieldset>
    {error ? <p role="alert" className="text-red-600">{error}</p> : null}
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="platform-button platform-button-primary" onClick={apply}>Apply link</button>
      <button type="button" className="platform-button" onClick={onCancel}>Cancel</button>
      {onRemove ? <button type="button" className="platform-button ml-auto text-red-600" onClick={onRemove}>Remove link</button> : null}
    </div>
  </div>;
}

function SectionSelect({ id, label, sections, anchor, canAssign, optional = false, onChange }: {
  id: string; label: string; sections: PageSection[]; anchor: string; canAssign: boolean; optional?: boolean; onChange: (value: string) => void;
}) {
  const known = !anchor || sections.some((section) => section.anchor === anchor);
  return <label className="flex flex-col gap-1" htmlFor={id}>{label}
    <select id={id} className={control} value={anchor} onChange={(event) => onChange(event.target.value)}>
      <option value="">{optional ? "Top of page" : "Choose a section…"}</option>
      {!known ? <option value={anchor}>#{anchor} (missing)</option> : null}
      {sections.map((section) => <option key={section.id} value={section.anchor ?? section.id} disabled={!section.anchor && !canAssign}>
        {section.label}{section.anchor ? ` · #${section.anchor}` : canAssign ? " · add anchor" : " · no anchor yet"}
      </option>)}
    </select>
    {sections.length === 0 ? <span className="text-[#6B6A66]">This page has no sections yet.</span> : null}
  </label>;
}

type SiteFile = { url: string; name: string; size: number };
function FileChooser({ selected, onSelect }: { selected: string; onSelect: (url: string, name: string) => void }) {
  const site = useContext(EditorSiteContext);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<SiteFile[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!site) return;
    let active = true;
    const timer = setTimeout(async () => {
      const result = await listSiteFiles({ siteId: site.siteId, query, offset: 0 }).catch(() => null);
      if (!active) return;
      if (!result || result.status === "error") { setError(result?.message ?? "Could not load files."); setFiles([]); return; }
      setError(""); setFiles(result.files);
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [site, query]);
  async function upload(file: File) {
    if (!site) return;
    setBusy(true); setError("");
    try {
      const prepared = await prepareFileUpload(site.siteId, { name: file.name, type: file.type, size: file.size });
      if (prepared.status === "error") { setError(prepared.message); return; }
      const { error: uploadError } = await createClient().storage.from("site-assets").upload(prepared.path, file, { contentType: file.type });
      if (uploadError) { setError("Upload failed. Check that migration 0027 has been applied, then retry."); return; }
      setFiles((previous) => [{ url: prepared.url, name: prepared.name, size: file.size }, ...(previous ?? [])]);
      onSelect(prepared.url, prepared.name);
    } catch { setError("Upload failed. Please retry."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  if (!site) return <p className="text-[#6B6A66]">Files are available inside the site editor.</p>;
  return <div className="flex flex-col gap-2">
    <div className="flex gap-2">
      <label className="relative flex-1"><span className="sr-only">Search files</span>
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B6A66]" />
        <input className={`${control} pl-8`} value={query} placeholder="Search files" onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button type="button" className="platform-button" disabled={busy} onClick={() => input.current?.click()}><Upload size={14} />{busy ? "Uploading…" : "Upload"}</button>
      <input ref={input} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    </div>
    <p className="text-[#6B6A66]">PDF, Word, Excel, PowerPoint, TXT or CSV, up to 20 MB.</p>
    {error ? <p role="alert" className="text-red-600">{error}</p> : null}
    <ul role="listbox" aria-label="Site files" className="max-h-44 overflow-y-auto rounded-lg border border-[#E8E7E3]">
      {files === null ? <li className="p-3 text-[#6B6A66]">Loading files…</li>
        : files.length === 0 ? <li className="p-3 text-[#6B6A66]">No files yet. Upload one to link to it.</li>
          : files.map((file) => <li key={file.url} role="option" aria-selected={file.url === selected}>
            <button type="button" onClick={() => onSelect(file.url, file.name)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F7F7F5] ${file.url === selected ? "bg-[#F1EFFF] text-[#4B3FE0]" : ""}`}>
              <FileText size={14} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-[#6B6A66]">{Math.max(1, Math.round(file.size / 1024))} KB</span>
            </button>
          </li>)}
    </ul>
  </div>;
}

/** Inspector control for link props: a summary plus the inline picker. */
export function LinkFieldControl({ value, onChange, readOnly }: { value: LinkValue; onChange: (value: SiteLink | "") => void; readOnly?: boolean }) {
  const ui = useContext(InteractionContext);
  const [open, setOpen] = useState(false);
  const summary = describeLink(value, ui?.pages ?? []);
  const missing = parseSiteLink(value)?.type === "page" && !ui?.pages.some((page) => page.id === (value as { pageId: string }).pageId);
  if (open && !readOnly) {
    return <div className="rounded-lg border border-[#E8E7E3] bg-[#FBFBFA] p-3">
      <LinkPicker value={value} autoFocus onCancel={() => setOpen(false)}
        onApply={(link) => { onChange(link); setOpen(false); }}
        onRemove={value ? () => { onChange(""); setOpen(false); } : undefined} />
    </div>;
  }
  return <button type="button" disabled={readOnly} onClick={() => setOpen(true)}
    className="flex w-full items-center gap-2 rounded-lg border border-[#E8E7E3] bg-white px-2.5 py-2 text-left text-sm hover:border-[#C9C8C3] disabled:opacity-60">
    <Link2 size={14} className="shrink-0 text-[#6B6A66]" />
    <span className={`min-w-0 flex-1 truncate ${value ? "" : "text-[#6B6A66]"} ${missing ? "text-red-600" : ""}`}>{summary}</span>
    <span className="text-xs font-medium text-[#4B3FE0]">{value ? "Change" : "Add link"}</span>
  </button>;
}
