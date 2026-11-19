"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createUsePuck, useGetPuck, type Data } from "@puckeditor/core";
import type { Editor } from "@tiptap/react";
import { editorAi } from "@/app/editor/[pageId]/ai-actions";
import type { EditorAiInput } from "@/lib/ai/editor-input";
import { useInteractions } from "./interaction-context";
import { useSectionLibrary, ROOT_ZONE } from "./section-library";
import { DesignThumbnail } from "./design-thumbnail";
import { AiContext } from "./editor-ai-context";

type Item = { type: string; props: Record<string, unknown> };
type Target =
  | { kind: "section"; section: Item; index: number; snapshot: string }
  | { kind: "add"; index: number; snapshot: string }
  | { kind: "text"; text: string; editor: Editor; from: number; to: number; snapshot: string };
const usePuck = createUsePuck();

export function EditorAiProvider({ children }: { children: React.ReactNode }) {
  const getPuck = useGetPuck();
  const { pageId } = useInteractions();
  const [target, setTarget] = useState<Target | null>(null);
  const openSection = useCallback(() => {
    const { appState } = getPuck();
    const selector = appState.ui.itemSelector;
    if (!selector || (selector.zone && selector.zone !== ROOT_ZONE)) return;
    const section = appState.data.content[selector.index];
    if (!section) return;
    if (getPuck().getPermissions({ item: section }).edit === false) return;
    setTarget({ kind: "section", section: structuredClone(section), index: selector.index, snapshot: JSON.stringify(section) });
  }, [getPuck]);
  const openAdd = useCallback(() => {
    const content = getPuck().appState.data.content;
    const selector = getPuck().appState.ui.itemSelector;
    const index = selector && (!selector.zone || selector.zone === ROOT_ZONE) ? selector.index + 1 : content.length;
    setTarget({ kind: "add", index, snapshot: JSON.stringify(content.map((item) => item.props.id)) });
  }, [getPuck]);
  const openText = useCallback((editor: Editor) => {
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const text = editor.state.doc.textBetween(from, to, "\n");
    if (!text.trim()) return;
    setTarget({ kind: "text", text, editor, from, to, snapshot: JSON.stringify(editor.state.doc.toJSON()) });
  }, []);
  return <AiContext.Provider value={{ openSection, openAdd, openText }}>
    {children}
    {target ? <AiDialog target={target} pageId={pageId} onClose={() => setTarget(null)} /> : null}
  </AiContext.Provider>;
}

function AiDialog({ target, pageId, onClose }: { target: Target; pageId: string; onClose: () => void }) {
  const getPuck = useGetPuck();
  const content = usePuck((state) => state.appState.data.content);
  const { theme } = useSectionLibrary();
  const ref = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  const [instruction, setInstruction] = useState("");
  const [tone, setTone] = useState("professional");
  const [mode, setMode] = useState<"rewrite" | "seo" | "custom">("rewrite");
  const [addMode, setAddMode] = useState<"catalog" | "custom">("catalog");
  const [index, setIndex] = useState(target.kind === "add" ? target.index : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof editorAi>> | null>(null);
  useEffect(() => {
    ref.current?.showModal();
    const activeRequest = requestId;
    return () => { activeRequest.current++; };
  }, []);
  const generate = async () => {
    let task: string;
    if (target.kind === "section") task = mode === "rewrite" ? `Rewrite in a ${tone} tone.` :
      mode === "seo" ? "Improve the section for relevant search terms without inventing facts." : instruction.trim();
    else task = target.kind === "text" ? `Rewrite in a ${tone} tone.${instruction.trim() ? ` ${instruction.trim()}` : ""}` : instruction.trim();
    if (target.kind === "section" && mode !== "custom" && instruction.trim()) task += ` ${instruction.trim()}`;
    if (task.length > 2000) { setError("Keep the full request under 2,000 characters."); return; }
    if (!task) { setError("Enter what you want to change."); return; }
    const input: EditorAiInput = target.kind === "section"
      ? { kind: "section", pageId, section: target.section, instruction: task, large: mode !== "rewrite" || tone === "longer" }
      : target.kind === "text" ? { kind: "text", pageId, text: target.text, instruction: task, large: tone === "longer" }
      : { kind: "add", pageId, instruction: task, mode: addMode };
    const id = ++requestId.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await editorAi(input);
      if (id !== requestId.current) return;
      if (response.status === "error") setError(response.message);
      else setResult(response);
    } catch (cause) {
      console.error("Editor AI request failed", { type: cause instanceof Error ? cause.name : "Unknown" });
      if (id === requestId.current) setError("The request could not be completed. Please retry.");
    } finally { if (id === requestId.current) setBusy(false); }
  };
  const apply = () => {
    if (!result || result.status !== "success") return;
    const output = result.result;
    if (target.kind === "text" && output.kind === "text") {
      if (target.editor.isDestroyed || JSON.stringify(target.editor.state.doc.toJSON()) !== target.snapshot) {
        setError("The text changed while AI was working. Cancel and select it again."); return;
      }
      const leading = target.text.match(/^\s*/)?.[0] ?? "";
      const trailing = target.text.match(/\s*$/)?.[0] ?? "";
      target.editor.chain().focus().setTextSelection({ from: target.from, to: target.to })
        .insertContent({ type: "text", text: `${leading}${output.text.trim()}${trailing}` }).run();
    } else if (target.kind === "section" && output.kind === "section") {
      const { appState, dispatch } = getPuck();
      const currentIndex = appState.data.content.findIndex((item) => item.props.id === target.section.props.id);
      if (currentIndex < 0 || JSON.stringify(appState.data.content[currentIndex]) !== target.snapshot) {
        setError("The section changed while AI was working. Cancel and try again."); return;
      }
      dispatch({ type: "replace", destinationZone: ROOT_ZONE, destinationIndex: currentIndex, data: output.section, recordHistory: true });
    } else if (target.kind === "add" && output.kind === "add") {
      const { appState, dispatch } = getPuck();
      if (JSON.stringify(appState.data.content.map((item) => item.props.id)) !== target.snapshot) {
        setError("The page structure changed while AI was working. Cancel and try again."); return;
      }
      dispatch({ type: "setData", recordHistory: true, data: (previous: Data) => ({
        ...previous, content: [...previous.content.slice(0, index), output.section, ...previous.content.slice(index)],
      }) });
      dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
    } else { setError("The AI result did not match the request."); return; }
    onClose();
  };
  const output = result?.status === "success" ? result.result : null;
  return <dialog ref={ref} aria-label="AI editor" onCancel={onClose}
    className="editor-modal m-auto max-h-[90vh] w-[min(760px,94vw)] overflow-y-auto rounded-xl border border-[#E8E7E3] bg-white p-5 shadow-xl backdrop:bg-black/40">
    <h2 className="text-base font-semibold">{target.kind === "add" ? "Add a section with AI" : target.kind === "text" ? "Rewrite selected text" : "Edit section with AI"}</h2>
    <p className="mt-1 text-xs text-zinc-500">Business info and the selected content are sent to the AI provider. Each attempt uses your AI allowance.</p>
    {target.kind === "section" ? <label className="mt-4 block text-xs font-medium">Action
      <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="mt-1 w-full rounded-lg border p-2 text-sm">
        <option value="rewrite">Rewrite</option><option value="seo">Improve for SEO</option><option value="custom">Custom request</option>
      </select>
    </label> : null}
    {target.kind === "add" ? <fieldset className="mt-4">
      <legend className="text-xs font-medium">Section type</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {([
          ["catalog", "SitoMax design"],
          ["custom", "Custom layout"],
        ] as const).map(([value, label]) => <label key={value} className="rounded-lg border p-2 text-xs">
          <input type="radio" name="ai-add-mode" value={value} checked={addMode === value}
            onChange={() => { setAddMode(value); setError(""); setResult(null); }} />
          <span className="ml-2">{label}</span>
        </label>)}
      </div>
    </fieldset> : null}
    {target.kind === "text" || (target.kind === "section" && mode === "rewrite") ? <label className="mt-3 block text-xs font-medium">Tone
      <select value={tone} onChange={(event) => setTone(event.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm">
        {["professional", "friendly", "luxurious", "shorter", "longer"].map((entry) => <option key={entry}>{entry}</option>)}
      </select>
    </label> : null}
    <label className="mt-3 block text-xs font-medium">{target.kind === "text" || (target.kind === "section" && mode !== "custom") ? "Extra context (optional)" : "What would you like?"}
      <textarea maxLength={2000} value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={3}
        placeholder={target.kind === "add" ? addMode === "custom"
          ? "Add a split section with a heading, image and contact button"
          : "Add a pricing section with 3 plans" : "Make this more upscale"} className="mt-1 w-full rounded-lg border p-2 text-sm" />
    </label>
    {target.kind === "add" ? <label className="mt-3 block text-xs font-medium">Insert position
      <select value={index} onChange={(event) => setIndex(Number(event.target.value))} className="mt-1 w-full rounded-lg border p-2 text-sm">
        {Array.from({ length: content.length + 1 }, (_, i) => <option key={i} value={i}>{i === 0 ? "Before first section" : `After section ${i}`}</option>)}
      </select>
    </label> : null}
    {output ? <div className="mt-4 rounded-lg border p-3">
      <p className="mb-2 text-xs font-semibold">Preview</p>
      {output.kind === "text" ? <p className="whitespace-pre-wrap text-sm">{output.text}</p> :
        <DesignThumbnail theme={theme} expanded design={{ id: "ai-preview", name: "AI preview", category: "Blank", thumbnail: null,
          blockType: output.section.type, props: output.section.props, styles: ["classic", "modern"] }} />}
      {output.kind === "add" && output.warnings.length ? <p className="mt-2 text-xs text-amber-700">{output.warnings.join(" ")}</p> : null}
    </div> : null}
    {error ? <p role="alert" className="mt-3 text-xs text-red-700">{error}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => void generate()} className="rounded-lg bg-[#4B3FE0] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{busy ? "Working..." : output ? "Try again" : "Generate preview"}</button>
      {output ? <button type="button" onClick={apply} className="rounded-lg bg-[#121212] px-4 py-2 text-xs font-medium text-white">Accept</button> : null}
      <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-xs">Cancel</button>
    </div>
  </dialog>;
}
