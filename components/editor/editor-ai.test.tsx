// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";

const mocks = vi.hoisted(() => ({
  request: vi.fn(), dispatch: vi.fn(),
  item: { type: "Hero", props: { id: "hero-1", heading: "Original" } },
}));
vi.mock("@puckeditor/core", () => ({
  registerOverlayPortal: () => () => {},
  createUsePuck: () => (selector: (state: object) => unknown) => selector({
    appState: { data: { content: [mocks.item] } },
  }),
  useGetPuck: () => () => ({
    appState: { data: { content: [mocks.item] }, ui: { itemSelector: { index: 0, zone: "root:default-zone" } } },
    getPermissions: () => ({ edit: true }), dispatch: mocks.dispatch,
  }),
}));
vi.mock("@/app/editor/[pageId]/ai-actions", () => ({ editorAi: mocks.request }));
vi.mock("./interaction-context", async () => ({
  useInteractions: () => ({ pageId: "page" }),
  InteractionContext: (await import("react")).createContext(null),
}));
vi.mock("./section-library", async () => ({
  ROOT_ZONE: "root:default-zone", useSectionLibrary: () => ({ theme: {} }),
  SectionLibraryContext: (await import("react")).createContext(null),
}));
vi.mock("./design-thumbnail", () => ({ DesignThumbnail: () => <div>Section preview</div> }));
import { EditorAiProvider } from "./editor-ai";
import { AiContext, useEditorAi } from "./editor-ai-context";
import { RichTextToolbar } from "./rich-text-toolbar";

function Harness() {
  const { openSection, openAdd } = useEditorAi();
  return <><button type="button" onClick={openSection}>Open AI</button>
    <button type="button" onClick={openAdd}>Add with AI</button></>;
}
function TextHarness({ editor }: { editor: Editor }) {
  const { openText } = useEditorAi();
  return <button type="button" onClick={() => openText(editor)}>Rewrite text</button>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.item.props.heading = "Original";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
});

describe("editor AI preview", () => {
  it("only replaces the section when accepted, recording undo history", async () => {
    mocks.request.mockResolvedValue({ status: "success", result: { kind: "section", section: { type: "Hero", props: { id: "hero-1", heading: "Revised" } } } });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const button = (text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;
    await act(async () => root.render(<EditorAiProvider><Harness /></EditorAiProvider>));
    await act(async () => button("Open AI").click());
    await act(async () => button("Generate preview").click());
    expect(container.textContent).toContain("Section preview");
    expect(mocks.dispatch).not.toHaveBeenCalled();
    await act(async () => button("Accept").click());
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: "replace", recordHistory: true, destinationIndex: 0, data: expect.objectContaining({ props: { id: "hero-1", heading: "Revised" } }),
    }));
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });

  it("refuses to overwrite a section changed during generation", async () => {
    mocks.request.mockResolvedValue({ status: "success", result: { kind: "section", section: { type: "Hero", props: { id: "hero-1", heading: "Revised" } } } });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const button = (text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;
    await act(async () => root.render(<EditorAiProvider><Harness /></EditorAiProvider>));
    await act(async () => button("Open AI").click());
    await act(async () => button("Generate preview").click());
    mocks.item.props.heading = "Newer edit";
    await act(async () => button("Accept").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("section changed");
    expect(mocks.dispatch).not.toHaveBeenCalled();
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });

  it("inserts an accepted AI section at the selected position with undo history", async () => {
    const section = { type: "Faq", props: { id: "faq-1", heading: "Questions" } };
    mocks.request.mockResolvedValue({ status: "success", result: { kind: "add", section, warnings: [] } });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const button = (text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;
    await act(async () => root.render(<EditorAiProvider><Harness /></EditorAiProvider>));
    await act(async () => button("Add with AI").click());
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Add FAQs");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Generate preview").click());
    await act(async () => button("Accept").click());
    const action = mocks.dispatch.mock.calls[0][0];
    expect(action).toMatchObject({ type: "setData", recordHistory: true });
    expect(action.data({ content: [mocks.item], root: {} }).content).toEqual([mocks.item, section]);
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });

  it("replaces selected text only on acceptance and supports text undo", async () => {
    mocks.request.mockResolvedValue({ status: "success", result: { kind: "text", text: "Refined" } });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const editor = new Editor({ extensions: [Document, Paragraph, Text, UndoRedo], content: "<p>Hello world</p>" });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const button = (text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;
    await act(async () => root.render(<EditorAiProvider><TextHarness editor={editor} /></EditorAiProvider>));
    await act(async () => button("Rewrite text").click());
    await act(async () => button("Generate preview").click());
    expect(editor.getText()).toBe("Hello world");
    await act(async () => button("Accept").click());
    expect(editor.getText()).toBe("Refined world");
    editor.commands.undo();
    expect(editor.getText()).toBe("Hello world");
    editor.destroy();
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });

  it("preserves whitespace at the edges of a rewritten selection", async () => {
    mocks.request.mockResolvedValue({ status: "success", result: { kind: "text", text: "bright" } });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const editor = new Editor({ extensions: [Document, Paragraph, Text, UndoRedo], content: "<p>One blue sky</p>" });
    editor.commands.setTextSelection({ from: 4, to: 10 });
    const button = (text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;
    await act(async () => root.render(<EditorAiProvider><TextHarness editor={editor} /></EditorAiProvider>));
    await act(async () => button("Rewrite text").click());
    await act(async () => button("Generate preview").click());
    await act(async () => button("Accept").click());
    expect(editor.getText()).toBe("One bright sky");
    editor.destroy();
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });

  it("shows the inline AI action when text becomes selected", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const editor = new Editor({ extensions: [Document, Paragraph, Text, UndoRedo], content: "<p>Hello world</p>" });
    const openText = vi.fn();
    await act(async () => root.render(<AiContext.Provider value={{ openText, openAdd: vi.fn(), openSection: vi.fn() }}>
      <RichTextToolbar editor={editor} readOnly={false} />
    </AiContext.Provider>));
    expect(container.querySelector('[aria-label="Rewrite with AI"]')).toBeNull();
    await act(async () => { editor.commands.setTextSelection({ from: 1, to: 6 }); });
    const button = container.querySelector<HTMLButtonElement>('[aria-label="Rewrite with AI"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    expect(openText).toHaveBeenCalledWith(editor);
    editor.destroy();
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });
});
