// @vitest-environment jsdom
import { act, createContext } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "@tiptap/react";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Heading } from "@tiptap/extension-heading";
import { Blockquote } from "@tiptap/extension-blockquote";
import { afterEach, expect, it, vi } from "vitest";
import { editorTextExtensions } from "@/lib/puck/richtext-extensions";
import { RichTextToolbar } from "./rich-text-toolbar";

vi.mock("@puckeditor/core", () => ({ registerOverlayPortal: () => () => {} }));
vi.mock("./section-library", () => ({ SectionLibraryContext: createContext(null) }));
vi.mock("./editor-ai-context", () => ({ useOptionalEditorAi: () => null }));
vi.mock("./link-picker", () => ({ LinkPicker: () => null }));

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])("keeps dropdowns usable across canvas focus changes (iframe: %s)", async (inFrame) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const frame = document.createElement("iframe");
  document.body.append(host);
  if (inFrame) document.body.append(frame);
  const canvasDocument = inFrame ? frame.contentDocument! : document;
  const canvas = canvasDocument.createElement("div");
  canvasDocument.body.append(canvas);
  const editor = new Editor({
    element: canvas,
    extensions: [Document, Paragraph, Text, Heading, Blockquote, ...editorTextExtensions],
    content: "<p>Example text</p>",
    editorProps: { handleScrollToSelection: () => true },
  });
  const root = createRoot(host);
  try {
    await act(async () => root.render(<RichTextToolbar editor={editor} readOnly={false} />));
    await act(async () => editor.view.dom.focus());
    const select = host.querySelector<HTMLSelectElement>('[aria-label="Text style"]')!;
    expect(select).not.toBeNull();
    await act(async () => {
      select.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      editor.view.dom.blur();
    });
    expect(host.querySelector('[aria-label="Text style"]')).toBe(select);
    await act(async () => select.focus());
    await act(async () => {
      select.value = "h2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(editor.getHTML()).toBe("<h2>Example text</h2>");
    expect(host.querySelector('[aria-label="Text style"]')).not.toBeNull();
    await act(async () => {
      select.value = "p";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(editor.getHTML()).toBe("<p>Example text</p>");
    await act(async () => select.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    await act(async () => editor.view.dom.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull();
    const outside = document.createElement("button");
    document.body.append(outside);
    await act(async () => outside.focus());
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    outside.remove();
  } finally {
    await act(async () => root.unmount());
    editor.destroy();
    host.remove();
    canvas.remove();
    frame.remove();
  }
});
