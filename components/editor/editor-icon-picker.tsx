"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { registerOverlayPortal, useGetPuck, type Field } from "@puckeditor/core";
import { editorTree, ROOT_ZONE } from "@/lib/editor/tree";
import { getEditableIcon, replaceIcon } from "@/lib/editor/icons";
import type { IconValue } from "@/lib/icons";
import { IconPickerField } from "./icon-picker-field";

type Target = { id: string; path: string; originalProps: string; value: IconValue; trigger: Element };

export function EditorIconPicker() {
  const getPuck = useGetPuck();
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const docs = new Map<Document, () => void>();
    const bind = () => {
      const frameDoc = document.querySelector<HTMLIFrameElement>("#preview-frame")?.contentDocument;
      const current = new Set([document, ...(frameDoc ? [frameDoc] : [])]);
      for (const [doc, cleanup] of docs) if (!current.has(doc)) { cleanup(); docs.delete(doc); }
      for (const doc of current) {
        if (docs.has(doc)) continue;
        const iconTarget = (event: Event) => {
          const element = event.target as Element | null;
          return element?.closest?.("[data-icon-path]");
        };
        const open = (event: Event) => {
          if (event.type === "keydown" && !["Enter", " "].includes((event as KeyboardEvent).key)) return;
          const icon = iconTarget(event);
          const id = icon?.closest("[data-editor-block]")?.getAttribute("data-editor-block");
          const path = icon?.getAttribute("data-icon-path");
          if (!icon || !id || !path) return;
          event.preventDefault();
          event.stopPropagation();
          const puck = getPuck();
          const entry = editorTree(puck.appState.data).find(({ item }) => item.props.id === id);
          if (!entry || puck.getPermissions({ item: entry.item }).edit === false) {
            setError("This block cannot be edited.");
            return;
          }
          try {
            const fields = puck.config.components[entry.item.type]?.fields as Record<string, Field>;
            const value = getEditableIcon(entry.item.props, fields, path, icon.getAttribute("data-icon-name") ?? undefined);
            setError("");
            setTarget({ id, path, value, originalProps: JSON.stringify(entry.item.props), trigger: icon });
          } catch (error) {
            setError(error instanceof Error ? error.message : "Could not open this icon.");
          }
        };
        const pointer = (event: Event) => { if (iconTarget(event)) event.stopPropagation(); };
        doc.addEventListener("pointerdown", pointer, true);
        doc.addEventListener("click", open, true);
        doc.addEventListener("keydown", open, true);
        docs.set(doc, () => {
          doc.removeEventListener("pointerdown", pointer, true);
          doc.removeEventListener("click", open, true);
          doc.removeEventListener("keydown", open, true);
        });
      }
    };
    bind();
    const timer = window.setInterval(bind, 200);
    return () => { window.clearInterval(timer); docs.forEach((cleanup) => cleanup()); };
  }, [getPuck]);

  const close = () => {
    const trigger = target?.trigger;
    setTarget(null);
    if (trigger?.isConnected) trigger.ownerDocument.defaultView?.requestAnimationFrame(() => (trigger as SVGElement).focus());
  };
  const apply = (value: IconValue) => {
    if (!target) return;
    const puck = getPuck();
    const entry = editorTree(puck.appState.data).find(({ item }) => item.props.id === target.id);
    if (!entry || puck.getPermissions({ item: entry.item }).edit === false) {
      setError("This block is no longer editable.");
      return;
    }
    if (JSON.stringify(entry.item.props) !== target.originalProps) {
      setError("This section changed while the picker was open. Close it and choose the icon again.");
      return;
    }
    try {
      const fields = puck.config.components[entry.item.type]?.fields as Record<string, Field>;
      const props = replaceIcon(entry.item.props, fields, target.path, value);
      puck.dispatch({
        type: "replace", destinationZone: entry.selector.zone ?? ROOT_ZONE, destinationIndex: entry.selector.index,
        data: { ...entry.item, props: { ...props, id: entry.item.props.id } }, recordHistory: true,
      });
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not update this icon.");
    }
  };
  return <>
    {target ? <IconDialog key={`${target.id}:${target.path}`} value={target.value} error={error} onApply={apply} onClose={close} />
      : error ? <p role="alert" className="platform-ui fixed right-4 bottom-12 z-[160] rounded-lg border border-red-200 bg-white p-3 text-xs text-red-700">
        {error}<button type="button" className="ml-3 underline" onClick={() => setError("")}>Dismiss</button>
      </p> : null}
  </>;
}

function IconDialog({ value, error, onApply, onClose }: {
  value: IconValue; error: string; onApply: (value: IconValue) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const unregister = registerOverlayPortal(dialog);
    return () => { unregister?.(); dialog?.close(); };
  }, []);
  return createPortal(<dialog ref={ref} aria-label="Choose icon" onCancel={(event) => { event.preventDefault(); onClose(); }}
    className="platform-ui editor-modal m-auto max-h-[90vh] w-[min(400px,94vw)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl backdrop:bg-black/40">
    <h2 className="mb-1 text-sm font-semibold">Choose an icon</h2>
    <p className="mb-4 text-xs text-zinc-500">Search the icon library, then set its size and color.</p>
    <IconPickerField value={draft} onChange={setDraft} />
    {error ? <p role="alert" className="mt-3 text-xs text-red-700">{error}</p> : null}
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" className="platform-button" onClick={onClose}>Cancel</button>
      <button type="button" className="platform-button platform-button-primary" onClick={() => onApply(draft)}>Apply icon</button>
    </div>
  </dialog>, document.body);
}
