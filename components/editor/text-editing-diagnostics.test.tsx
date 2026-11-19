// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextEditingDiagnostics } from "./text-editing-diagnostics";

let root: Root;
let container: HTMLDivElement;
let frame: HTMLIFrameElement;
let doc: Document;
let editor: HTMLDivElement;
let overlay: HTMLDivElement;
const copy = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  copy.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  frame = document.createElement("iframe");
  frame.id = "preview-frame";
  document.body.append(container, frame);
  doc = frame.contentDocument!;
  editor = doc.createElement("div");
  editor.className = "ProseMirror";
  editor.setAttribute("contenteditable", "true");
  editor.tabIndex = 0;
  editor.textContent = "PRIVATE DRAFT TEXT MUST NOT BE COLLECTED";
  overlay = doc.createElement("div");
  overlay.className = "intercepting-layer";
  doc.body.append(editor, overlay);
  Object.defineProperty(doc, "elementsFromPoint", { configurable: true, value: () => [overlay, editor] });
  Object.defineProperty(frame, "offsetWidth", { configurable: true, value: 1280 });
  vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 960, 720));
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); frame.remove();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

const button = (label: string) => [...document.querySelectorAll("button")].find(node => node.textContent === label)!;
const details = () => document.querySelector<HTMLTextAreaElement>('[aria-label="Diagnostic details"]')!;

describe("temporary text editing check", () => {
  it("reports the blocking layer without capturing text or changing pointer behavior", async () => {
    const pointer = vi.fn();
    overlay.addEventListener("pointerdown", pointer);
    await act(async () => root.render(<TextEditingDiagnostics />));
    await act(async () => button("Check text editing").click());
    const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    await act(async () => overlay.dispatchEvent(event));
    expect(pointer).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
    expect(details()).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    const report = JSON.parse(details().value);
    expect(report.eventTarget.class).toBe("intercepting-layer");
    expect(report.hitLayers.map((item: { class: string }) => item.class)).toEqual(["intercepting-layer", "ProseMirror"]);
    expect(report.frameScale).toBe(0.75);
    expect(report.editableCount).toBe(1);
    expect(details().value).not.toContain("PRIVATE DRAFT");
    expect(editor.textContent).toBe("PRIVATE DRAFT TEXT MUST NOT BE COLLECTED");
    await act(async () => button("Copy report").click());
    expect(copy).toHaveBeenCalledWith(details().value);
    expect(button("Copied")).toBeDefined();
  });

  it("records focus inside the iframe before opening the report dialog and surfaces copy errors", async () => {
    await act(async () => root.render(<TextEditingDiagnostics />));
    await act(async () => button("Check text editing").click());
    await act(async () => {
      editor.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      editor.focus();
      await vi.advanceTimersByTimeAsync(500);
    });
    const report = JSON.parse(details().value);
    expect(report.focused.class).toBe("ProseMirror");
    expect(report.focusTrail.some((item: { class: string }) => item.class === "ProseMirror")).toBe(true);
    copy.mockRejectedValueOnce(new Error("Clipboard denied"));
    await act(async () => button("Copy report").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("copy it manually");
  });

  it("detects an app-level layer over the iframe as well as the canvas underneath", async () => {
    const layer = document.createElement("div");
    layer.className = "app-overlay";
    document.body.append(layer);
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [layer, frame] });
    try {
      await act(async () => root.render(<TextEditingDiagnostics />));
      await act(async () => button("Check text editing").click());
      await act(async () => {
        layer.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
        await vi.advanceTimersByTimeAsync(500);
      });
      const report = JSON.parse(details().value);
      expect(report.eventDocument).toBe("platform");
      expect(report.eventTarget.class).toBe("app-overlay");
      expect(report.canvasHitLayers.some((item: { class: string }) => item.class === "ProseMirror")).toBe(true);
    } finally {
      layer.remove();
      Reflect.deleteProperty(document, "elementsFromPoint");
    }
  });

  it("removes recording listeners and timers when cancelled", async () => {
    await act(async () => root.render(<TextEditingDiagnostics />));
    await act(async () => button("Check text editing").click());
    await act(async () => button("Cancel check").click());
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(details()).toBeNull();
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("reports an unavailable preview instead of silently failing", async () => {
    frame.remove();
    await act(async () => root.render(<TextEditingDiagnostics />));
    await act(async () => button("Check text editing").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("canvas is not ready");
  });
});
