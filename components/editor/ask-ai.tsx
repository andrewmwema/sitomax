"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Render, useGetPuck, type Data } from "@puckeditor/core";
import { Sparkles, X } from "lucide-react";
import { suggestEditorEdits } from "@/app/editor/[pageId]/ai-actions";
import { applyEditOperations, type EditScope } from "@/lib/ai/edit-operations";
import { puckConfig } from "@/lib/puck/config";
import { ROOT_ZONE } from "@/lib/editor/tree";
import type { SiteTheme } from "@/lib/theme/presets";
import { editorTheme, type useDraftPersistence } from "./use-draft-persistence";
import { editorHeader } from "@/lib/header";

const Context = createContext<{
  open: (sectionId?: string, scope?: EditScope) => void; proposal: { data: Data; theme: SiteTheme } | null;
  metadata?: Record<string, unknown>;
} | null>(null);
export const useAskAi = () => useContext(Context);

export function AskAiCanvas({ children }: { children: ReactNode }) {
  const context = useAskAi();
  const proposal = context?.proposal;
  return proposal ? <div data-ai-preview inert><Render config={puckConfig} data={proposal.data}
    metadata={{ ...context?.metadata, theme: proposal.theme, siteHeader: editorHeader(proposal.data) }} /></div> : children;
}

const examples: { text: string; scope?: EditScope }[] = [
  { text: "Make the footer lighter", scope: "page" }, { text: "Use a green accent", scope: "theme" },
  { text: "Add more spacing" }, { text: "Switch hero to a split layout", scope: "page" }, { text: "Shorten this text" },
  { text: "Use a split header layout", scope: "header" },
];
type Proposal = ReturnType<typeof applyEditOperations> & { plan: string; base: Data; operations: Parameters<typeof applyEditOperations>[4] };

export function AskAiProvider({ children, pageId, theme, persistence, metadata }: {
  children: ReactNode; pageId: string; theme: SiteTheme; persistence: ReturnType<typeof useDraftPersistence>;
  metadata?: Record<string, unknown>;
}) {
  const getPuck = useGetPuck();
  const [visible, setVisible] = useState(false);
  const [scope, setScope] = useState<EditScope>("page");
  const [sectionId, setSectionId] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [refinement, setRefinement] = useState("");
  const [refining, setRefining] = useState(false);
  const [pending, setPending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  const request = useRef(0);

  const open = useCallback((targetId?: string, requestedScope?: EditScope) => {
    const { selectedItem, appState } = getPuck();
    const zone = appState.ui.itemSelector?.zone;
    const id = targetId ?? ((!zone || zone === ROOT_ZONE) ? selectedItem?.props.id : undefined);
    if (requestedScope === "header") { setSectionId(undefined); setScope("header"); }
    else if (typeof id === "string" && appState.data.content.some((item) => item.props.id === id && item.type !== "Embed")) {
      setSectionId(id); setScope("section");
    } else { setSectionId(undefined); setScope("page"); }
    if (document.activeElement instanceof HTMLElement) focusReturn.current = document.activeElement;
    request.current++;
    setVisible(true); setPending(false); setError(""); setPrompt(""); setProposal(null); setRefinement(""); setRefining(false); setConfirmed(false);
  }, [getPuck]);

  function close() {
    request.current++;
    setVisible(false); setPending(false); setProposal(null);
    focusReturn.current?.focus();
  }

  useEffect(() => {
    if (visible) field.current?.focus();
  }, [visible, refining]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || (!event.metaKey && !event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      if (visible) field.current?.focus();
      else open();
    }
    document.addEventListener("keydown", shortcut);
    let frameDoc: Document | null = null;
    const attach = () => {
      const current = document.querySelector<HTMLIFrameElement>("#preview-frame")?.contentDocument ?? null;
      if (frameDoc === current) return;
      frameDoc?.removeEventListener("keydown", shortcut);
      frameDoc = current;
      frameDoc?.addEventListener("keydown", shortcut);
    };
    attach();
    const timer = setInterval(attach, 500);
    return () => { clearInterval(timer); document.removeEventListener("keydown", shortcut); frameDoc?.removeEventListener("keydown", shortcut); };
  }, [open, visible]);

  async function generate() {
    const instruction = (refining ? refinement : prompt).trim();
    if (!instruction) return;
    const sequence = ++request.current;
    setError(""); setPending(true); setConfirmed(false);
    const base = structuredClone(getPuck().appState.data);
    const sections = scope === "theme" || scope === "header" ? undefined : scope === "page" ? base.content
      : base.content.filter((item) => item.props.id === sectionId);
    try {
      const response = await suggestEditorEdits({ pageId, scope, sectionId: scope === "section" ? sectionId : undefined, instruction,
        header: scope === "header" ? editorHeader(base) : undefined,
        sectionPosition: scope === "section" ? { index: base.content.findIndex((item) => item.props.id === sectionId), count: base.content.length } : undefined,
        sections: sections?.map(({ type, props }) => ({ type, props })),
        refinement: refining && proposal
          ? `Original request: ${prompt}\nPrevious proposal (revise it and return all desired operations): ${proposal.plan}\n${JSON.stringify(proposal.operations)}`.slice(0, 4000)
          : undefined,
      });
      if (sequence !== request.current) return;
      if (response.status === "error") { setError(response.message); return; }
      if (JSON.stringify(base) !== JSON.stringify(getPuck().appState.data)) {
        setError("The page changed while AI was working. Generate a new proposal."); return;
      }
      const result = applyEditOperations(base, editorTheme(base, theme), scope, sectionId, response.result.operations,
        () => true, response.result.inserted);
      setProposal({ ...result, base, plan: response.result.plan, operations: response.result.operations,
        warnings: [...new Set([...result.warnings, ...response.result.warnings])] });
      setRefining(false); setRefinement("");
    } catch (cause) {
      if (sequence === request.current) setError(cause instanceof Error && cause.name === "Error" ? cause.message : "Could not preview the proposed changes.");
    } finally { if (sequence === request.current) setPending(false); }
  }

  async function apply() {
    if (!proposal?.changes.length || (proposal.deleted.length && !confirmed)) return;
    setApplying(true); setError("");
    try {
      if (await persistence.applyAi(proposal.base, proposal.data, scope === "theme" ? proposal.theme : undefined)) close();
      else setError("The edit was not applied. See the editor status for details.");
    } finally { setApplying(false); }
  }

  return <Context.Provider value={{ open, proposal: proposal?.changes.length ? proposal : null, metadata }}>
    {children}
    {visible ? <aside aria-label="Ask AI to edit" className="platform-ui editor-ai-drawer fixed right-3 top-20 bottom-12 z-[170] flex w-[min(360px,calc(100vw-1.5rem))] flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
      onKeyDown={(event) => { if (event.key === "Escape" && !applying) { event.stopPropagation(); close(); } }}>
      <header className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Sparkles size={16} />Ask AI to edit</h2>
        <button type="button" aria-label="Close Ask AI" disabled={applying} className="rounded p-1 hover:bg-zinc-100" onClick={close}><X size={18} /></button></header>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <label className="block text-xs font-medium">Scope
          <select className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm" value={scope} disabled={pending || applying || refining}
            onChange={(event) => { setScope(event.target.value as EditScope); setProposal(null); setError(""); setConfirmed(false); }}>
            <option value="section" disabled={!sectionId}>Selected section</option><option value="page">This page</option><option value="theme">Whole site theme</option>
            <option value="header" disabled={metadata?.headersReady === false}>Whole site header</option>
          </select>
        </label>
        <label className="block text-xs font-medium">{refining ? "What should change in this proposal?" : "What would you like to change?"}
          <textarea ref={field} rows={4} maxLength={2000} className="mt-1 w-full rounded-lg border border-zinc-300 p-2 text-sm"
            disabled={pending || applying} value={refining ? refinement : prompt}
            onChange={(event) => refining ? setRefinement(event.target.value) : setPrompt(event.target.value)} />
        </label>
        {!refining && !proposal ? <div className="flex flex-wrap gap-1">{examples.map((example) =>
          <button key={example.text} type="button" disabled={pending || (example.scope === "header" && metadata?.headersReady === false)} className="rounded-full border border-zinc-200 px-2 py-1 text-[11px] hover:bg-zinc-100"
            onClick={() => { setPrompt(example.text); if (example.scope) setScope(example.scope); field.current?.focus(); }}>{example.text}</button>)}</div> : null}
        <button type="submit" className="platform-button platform-button-ai" disabled={pending || applying || !(refining ? refinement : prompt).trim()}>
          {pending ? "Preparing preview..." : refining ? "Update preview" : "Generate preview"}</button>
      </form>
      {error ? <p className="mt-3 text-xs text-red-700" role="alert">{error}</p> : null}
      {proposal ? <section className="mt-4 border-t pt-4 text-sm" aria-live="polite">
        <h3 className="mb-2 font-semibold">{proposal.changes.length ? "Canvas preview · not saved" : "Suggestion"}</h3>
        <p>{proposal.plan}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{proposal.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
        {proposal.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-amber-800">{warning}</p>)}
        {proposal.deleted.length ? <label className="mt-3 flex gap-2 text-xs"><input type="checkbox" checked={confirmed} disabled={pending || applying}
          onChange={(event) => setConfirmed(event.target.checked)} />Confirm deletion of {proposal.deleted.join(", ")}.</label> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="platform-button platform-button-primary" disabled={pending || applying || persistence.busy !== null || !proposal.changes.length || (proposal.deleted.length > 0 && !confirmed)}
            onClick={() => void apply()}>{applying ? "Applying..." : "Apply"}</button>
          <button type="button" className="platform-button" disabled={applying} onClick={close}>Discard</button>
          <button type="button" className="platform-button" disabled={pending || applying || refining} onClick={() => setRefining(true)}>Refine</button>
        </div>
      </section> : null}
    </aside> : null}
  </Context.Provider>;
}
