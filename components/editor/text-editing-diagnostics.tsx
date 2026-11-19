"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function describeElement(element: Element | null) {
  if (!element) return null;
  const win = element.ownerDocument.defaultView!;
  const style = win.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    tag: element.tagName,
    class: element.getAttribute("class"),
    role: element.getAttribute("role"),
    contentEditable: element.getAttribute("contenteditable"),
    editable: element instanceof win.HTMLElement ? element.isContentEditable : false,
    pointerEvents: style.pointerEvents,
    userSelect: style.userSelect,
    webkitUserSelect: style.webkitUserSelect,
    cursor: style.cursor,
    position: style.position,
    zIndex: style.zIndex,
    visibility: style.visibility,
    opacity: style.opacity,
    display: style.display,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  };
}

type Report = {
  version: 1;
  browser: string;
  frameScale: number;
  eventDocument: "canvas" | "platform";
  hitLayers: ReturnType<typeof describeElement>[];
  canvasHitLayers: ReturnType<typeof describeElement>[];
  eventTarget: ReturnType<typeof describeElement>;
  ancestors: ReturnType<typeof describeElement>[];
  focusTrail: ReturnType<typeof describeElement>[];
  focused: ReturnType<typeof describeElement>;
  pointerDownPrevented: boolean;
  editableCount: number;
  toolbarVisible: boolean;
};

/** Temporary admin diagnostic: DOM metadata only, never text or page JSON. */
export function TextEditingDiagnostics() {
  const [captureDoc, setCaptureDoc] = useState<Document | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  function start() {
    const doc = document.querySelector<HTMLIFrameElement>("#preview-frame")?.contentDocument;
    setError(""); setCopied(false); setReport(null);
    if (!doc?.defaultView) {
      setError("The canvas is not ready. Wait for the preview to load, then try again.");
      return;
    }
    setCaptureDoc(doc);
  }

  useEffect(() => {
    if (!captureDoc) return;
    const doc = captureDoc;
    const focusTrail: Report["focusTrail"] = [];
    let sample: ReturnType<typeof setTimeout> | undefined;
    let captured = false;
    const focus = (event: FocusEvent) => {
      const FrameElement = doc.defaultView?.Element;
      if (focusTrail.length < 8 && (event.target instanceof Element || (FrameElement && event.target instanceof FrameElement))) {
        focusTrail.push(describeElement(event.target));
      }
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCaptureDoc(null);
    };
    const capture = (event: PointerEvent) => {
      const frame = document.querySelector<HTMLIFrameElement>("#preview-frame");
      if (!frame || frame.contentDocument !== doc || !doc.defaultView) {
        setError("The preview reloaded. Start the check again.");
        setCaptureDoc(null);
        return;
      }
      if (captured) return;
      const target = event.target instanceof Element || event.target instanceof doc.defaultView.Element ? event.target : null;
      if (!target) return;
      const bounds = frame.getBoundingClientRect();
      const inCanvas = target.ownerDocument === doc;
      if (!inCanvas && (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom)) return;
      captured = true;
      const ancestors: Report["ancestors"] = [];
      for (let element: Element | null = target; element && ancestors.length < 8; element = element.parentElement) {
        ancestors.push(describeElement(element));
      }
      const hitLayers = target.ownerDocument.elementsFromPoint(event.clientX, event.clientY).slice(0, 8).map(describeElement);
      const eventTarget = describeElement(target);
      const frameScale = bounds.width / frame.offsetWidth;
      const canvasX = inCanvas ? event.clientX : (event.clientX - bounds.left) / frameScale;
      const canvasY = inCanvas ? event.clientY : (event.clientY - bounds.top) * frame.offsetHeight / bounds.height;
      const canvasHitLayers = doc.elementsFromPoint(canvasX, canvasY).slice(0, 8).map(describeElement);
      sample = setTimeout(() => {
        setReport({
          version: 1, browser: navigator.userAgent, frameScale,
          eventDocument: inCanvas ? "canvas" : "platform",
          hitLayers, canvasHitLayers, eventTarget, ancestors, focusTrail,
          focused: describeElement(doc.activeElement),
          pointerDownPrevented: event.defaultPrevented,
          editableCount: doc.querySelectorAll('.ProseMirror[contenteditable="true"]').length,
          toolbarVisible: Boolean(document.querySelector('[aria-label="Text formatting"]')),
        });
        setCaptureDoc(null);
      }, 500);
    };
    const expiry = setTimeout(() => {
      setCaptureDoc(null);
      setError("No canvas click was recorded. Start the check again when you are ready.");
    }, 60_000);
    doc.addEventListener("pointerdown", capture, true);
    document.addEventListener("pointerdown", capture, true);
    doc.addEventListener("focusin", focus, true);
    document.addEventListener("focusin", focus, true);
    doc.addEventListener("keydown", cancel, true);
    document.addEventListener("keydown", cancel, true);
    return () => {
      clearTimeout(expiry); clearTimeout(sample);
      doc.removeEventListener("pointerdown", capture, true);
      document.removeEventListener("pointerdown", capture, true);
      doc.removeEventListener("focusin", focus, true);
      document.removeEventListener("focusin", focus, true);
      doc.removeEventListener("keydown", cancel, true);
      document.removeEventListener("keydown", cancel, true);
    };
  }, [captureDoc]);

  useEffect(() => {
    if (!report) return;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, [report]);

  const output = report ? JSON.stringify(report, null, 2) : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true); setError("");
    } catch {
      setError("Could not copy. Select the report below and copy it manually.");
    }
  }

  return <>
    <button type="button" className="platform-button" onClick={start}>Check text editing</button>
    {error && !report ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
    {captureDoc ? createPortal(
      <aside role="status" className="platform-ui fixed right-4 top-20 z-[210] max-w-xs rounded-xl border border-zinc-300 bg-white p-4 text-sm shadow-lg">
        <p>Click the canvas text that will not edit. This check does not change your content.</p>
        <button type="button" className="platform-button mt-3" onClick={() => setCaptureDoc(null)}>Cancel check</button>
      </aside>, document.body,
    ) : null}
    {report ? createPortal(
      <dialog ref={dialog} aria-label="Text editing diagnostic report" onCancel={() => setReport(null)}
        className="platform-ui fixed inset-0 m-auto max-h-[85vh] w-[min(640px,calc(100vw-2rem))] overflow-auto rounded-xl border border-zinc-300 bg-white p-5 text-sm shadow-xl backdrop:bg-black/40">
        <h2 className="font-semibold">Text editing check</h2>
        <p className="mt-2 text-zinc-600">Copy this report and paste it into our chat. It contains element and focus information, not your site text or draft data.</p>
        <textarea readOnly aria-label="Diagnostic details" value={output} rows={12}
          className="mt-4 w-full rounded-lg border border-zinc-300 p-3 font-mono text-xs" />
        {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className="platform-button platform-button-primary" onClick={() => void copy()}>{copied ? "Copied" : "Copy report"}</button>
          <button type="button" className="platform-button" onClick={() => setReport(null)}>Close</button>
        </div>
      </dialog>, document.body,
    ) : null}
  </>;
}
