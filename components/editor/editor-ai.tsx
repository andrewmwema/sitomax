"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { editorAi } from "@/app/editor/[pageId]/ai-actions";
import { useInteractions } from "./interaction-context";
import { AiContext } from "./editor-ai-context";

type Target = { text: string; editor: Editor; from: number; to: number; snapshot: string };

/** Inline "Rewrite with AI" for selected text. Site and section changes go through the AI agent. */
export function EditorAiProvider({ children }: { children: React.ReactNode }) {
  const { pageId } = useInteractions();
  const [target, setTarget] = useState<Target | null>(null);
  const openText = useCallback((editor: Editor) => {
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const text = editor.state.doc.textBetween(from, to, "\n");
    if (!text.trim()) return;
    setTarget({ text, editor, from, to, snapshot: JSON.stringify(editor.state.doc.toJSON()) });
  }, []);
  return <AiContext.Provider value={{ openText }}>
    {children}
    {target ? <AiDialog target={target} pageId={pageId} onClose={() => setTarget(null)} /> : null}
  </AiContext.Provider>;
}

function AiDialog({ target, pageId, onClose }: { target: Target; pageId: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  const [instruction, setInstruction] = useState("");
  const [tone, setTone] = useState("professional");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof editorAi>> | null>(null);
  useEffect(() => {
    ref.current?.showModal();
    const activeRequest = requestId;
    return () => { activeRequest.current++; };
  }, []);
  const generate = async () => {
    const task = `Rewrite in a ${tone} tone.${instruction.trim() ? ` ${instruction.trim()}` : ""}`;
    if (task.length > 2000) { setError("Keep the full request under 2,000 characters."); return; }
    const id = ++requestId.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await editorAi({ kind: "text", pageId, text: target.text, instruction: task, large: tone === "longer" });
      if (id !== requestId.current) return;
      if (response.status === "error") setError(response.message);
      else setResult(response);
    } catch (cause) {
      console.error("Editor AI request failed", { type: cause instanceof Error ? cause.name : "Unknown" });
      if (id === requestId.current) setError("The request could not be completed. Please retry.");
    } finally { if (id === requestId.current) setBusy(false); }
  };
  const output = result?.status === "success" && result.result.kind === "text" ? result.result : null;
  const apply = () => {
    if (!output) { setError("The AI result did not match the request."); return; }
    if (target.editor.isDestroyed || JSON.stringify(target.editor.state.doc.toJSON()) !== target.snapshot) {
      setError("The text changed while AI was working. Cancel and select it again."); return;
    }
    const leading = target.text.match(/^\s*/)?.[0] ?? "";
    const trailing = target.text.match(/\s*$/)?.[0] ?? "";
    target.editor.chain().focus().setTextSelection({ from: target.from, to: target.to })
      .insertContent({ type: "text", text: `${leading}${output.text.trim()}${trailing}` }).run();
    onClose();
  };
  return <dialog ref={ref} aria-label="AI editor" onCancel={onClose}
    className="editor-modal m-auto max-h-[90vh] w-[min(760px,94vw)] overflow-y-auto rounded-xl border border-[#E8E7E3] bg-white p-5 shadow-xl backdrop:bg-black/40">
    <h2 className="text-base font-semibold">Rewrite selected text</h2>
    <p className="mt-1 text-xs text-zinc-500">Business info and the selected content are sent to the AI provider. Each attempt uses your AI allowance.</p>
    <label className="mt-3 block text-xs font-medium">Tone
      <select value={tone} onChange={(event) => setTone(event.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm">
        {["professional", "friendly", "luxurious", "shorter", "longer"].map((entry) => <option key={entry}>{entry}</option>)}
      </select>
    </label>
    <label className="mt-3 block text-xs font-medium">Extra context (optional)
      <textarea maxLength={2000} value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={3}
        placeholder="Make this more upscale" className="mt-1 w-full rounded-lg border p-2 text-sm" />
    </label>
    {output ? <div className="mt-4 rounded-lg border p-3">
      <p className="mb-2 text-xs font-semibold">Preview</p>
      <p className="whitespace-pre-wrap text-sm">{output.text}</p>
    </div> : null}
    {error ? <p role="alert" className="mt-3 text-xs text-red-700">{error}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => void generate()} className="rounded-lg bg-[#4B3FE0] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">{busy ? "Working..." : output ? "Try again" : "Generate preview"}</button>
      {output ? <button type="button" onClick={apply} className="rounded-lg bg-[#121212] px-4 py-2 text-xs font-medium text-white">Accept</button> : null}
      <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-xs">Cancel</button>
    </div>
  </dialog>;
}
