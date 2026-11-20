// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import Link from "@tiptap/extension-link";
import Bold from "@tiptap/extension-bold";
import Heading from "@tiptap/extension-heading";
import Blockquote from "@tiptap/extension-blockquote";
import { TextAppearance, TextLayout, WritingAssistantOptOut } from "@/lib/puck/richtext-extensions";

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
  appPoint: (_doc: globalThis.Document, x: number, y: number) => ({ x, y }),
  InteractionContext: (await import("react")).createContext(null),
}));
vi.mock("./section-library", async () => ({
  ROOT_ZONE: "root:default-zone", useSectionLibrary: () => ({ theme: {} }),
  SectionLibraryContext: (await import("react")).createContext(null),
}));
vi.mock("./design-thumbnail", () => ({ DesignThumbnail: () => <div>Section preview</div> }));
vi.mock("./link-picker", () => ({
  LinkPicker: ({ onApply, onCancel }: { onApply: (link: { type: "url"; url: string }) => void; onCancel: () => void }) =>
    <div aria-label="Link picker">
      <button onClick={() => onApply({ type: "url", url: "https://example.com" })}>Apply link</button>
      <button onClick={onCancel}>Cancel link</button>
    </div>,
}));
import { EditorAiProvider } from "./editor-ai";
import { AiContext, useEditorAi } from "./editor-ai-context";
import { applyTextAppearance, RichTextToolbar } from "./rich-text-toolbar";

function focusText(editor: Editor) {
  document.body.append(editor.view.dom);
  editor.view.focus();
}

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
  it.each([1, 2] as const)("initializes a legacy heading at level %i and preserves an explicitly chosen paragraph", async (level) => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const editor = new Editor({ extensions: [Document, Paragraph, Text, UndoRedo, Blockquote, Heading.configure({ levels: [1, 2, 3, 4, 5, 6] })], content: "Existing heading" });
    vi.spyOn(editor.view, "coordsAtPos").mockReturnValue({ left: 0, right: 0, top: 0, bottom: 0 });
    await act(async () => root.render(<RichTextToolbar editor={editor} readOnly={false} initialHeadingLevel={level} />));
    await act(async () => focusText(editor));
    expect(editor.getHTML()).toBe(`<h${level}>Existing heading</h${level}>`);
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Text style"]')!;
    expect(select.value).toBe(`h${level}`);
    await act(async () => { select.value = "h6"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(editor.getHTML()).toBe("<h6>Existing heading</h6>");
    await act(async () => { select.value = "p"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { editor.view.dom.blur(); editor.view.focus(); });
    expect(editor.getHTML()).toBe("<p>Existing heading</p>");
    await act(async () => root.unmount());
    editor.destroy(); container.remove(); vi.unstubAllGlobals();
  });

  it("initializes when the inline menu mounts after focus, but leaves saved paragraphs unchanged", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const extensions = [Document, Paragraph, Text, UndoRedo, Blockquote, Heading];
    const editor = new Editor({ extensions, content: "Legacy" });
    vi.spyOn(editor.view, "coordsAtPos").mockReturnValue({ left: 0, right: 0, top: 0, bottom: 0 });
    await act(async () => focusText(editor));
    await act(async () => root.render(<RichTextToolbar editor={editor} readOnly={false} initialHeadingLevel={1} />));
    expect(editor.getHTML()).toBe("<h1>Legacy</h1>");
    await act(async () => root.unmount());
    editor.destroy(); container.remove();
    const secondContainer = document.createElement("div"); document.body.append(secondContainer);
    const secondRoot = createRoot(secondContainer);
    const saved = new Editor({ extensions, content: "<p>Explicit paragraph</p>" });
    await act(async () => secondRoot.render(<RichTextToolbar editor={saved} readOnly={false} initialHeadingLevel={1} />));
    await act(async () => focusText(saved));
    expect(saved.getHTML()).toBe("<p>Explicit paragraph</p>");
    await act(async () => secondRoot.unmount());
    saved.destroy(); secondContainer.remove(); vi.unstubAllGlobals();
  });

  it.each(["object", "function"])("opts out of writing overlays before mounting without replacing %s editor attributes or saved HTML", (kind) => {
    const attributes = { role: "textbox", "data-existing": "preserved" };
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, Bold, WritingAssistantOptOut],
      editorProps: { attributes: kind === "function" ? () => attributes : attributes },
      content: "<p>Existing <strong>formatted</strong> copy</p>",
    });
    expect(editor.view.dom.getAttribute("data-existing")).toBe("preserved");
    expect(editor.view.dom.getAttribute("role")).toBe("textbox");
    expect(editor.view.dom.getAttribute("data-gramm")).toBe("false");
    expect(editor.view.dom.getAttribute("data-gramm_editor")).toBe("false");
    expect(editor.view.dom.getAttribute("data-enable-grammarly")).toBe("false");
    expect(editor.getHTML()).toBe("<p>Existing <strong>formatted</strong> copy</p>");
    editor.commands.setTextSelection({ from: 1, to: 10 });
    editor.commands.toggleBold();
    expect(editor.getHTML()).toContain("<strong>Existing formatted</strong>");
    expect(editor.getHTML()).not.toContain("data-gramm");
    editor.destroy();
  });

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
    await act(async () => focusText(editor));
    expect(container.querySelector('[aria-label="Rewrite with AI"]')).toBeNull();
    await act(async () => { editor.commands.setTextSelection({ from: 1, to: 6 }); });
    const button = container.querySelector<HTMLButtonElement>('[aria-label="Rewrite with AI"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    expect(openText).toHaveBeenCalledWith(editor);
    editor.destroy();
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  });

  it("uses icons with shortcut tooltips and asks for a selection instead of inserting an empty link", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const editor = new Editor({ extensions: [Document, Paragraph, Text, UndoRedo, Link], content: "<p>Hello world</p>" });
    await act(async () => root.render(<RichTextToolbar editor={editor} readOnly={false} />));
    await act(async () => focusText(editor));
    const link = container.querySelector<HTMLButtonElement>('[aria-label="Link"]')!;
    expect(link.querySelector("svg")).not.toBeNull();
    expect(link.title).toContain("Ctrl+K");
    expect(container.querySelector('[aria-label="Bold"]')?.getAttribute("title")).toContain("Ctrl+B");
    await act(async () => link.click());
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Select text to add a link");
    expect(container.querySelector('[aria-label="Link picker"]')).toBeNull();
    expect(editor.getHTML()).toBe("<p>Hello world</p>");
    await act(async () => root.unmount());
    editor.destroy(); container.remove(); vi.unstubAllGlobals();
  });

  it.each(["ctrlKey", "metaKey", "button"] as const)("opens the picker with %s and applies only to the saved selection", async (modifier) => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const editorElement = document.createElement("div"); document.body.append(editorElement);
    const editor = new Editor({ element: editorElement, extensions: [Document, Paragraph, Text, UndoRedo, Link], content: "<p>Hello world</p>" });
    await act(async () => root.render(<RichTextToolbar editor={editor} readOnly={false} />));
    await act(async () => editor.view.focus());
    await act(async () => {
      editor.commands.setTextSelection({ from: 1, to: 6 });
      editor.view.focus();
      if (modifier === "button") container.querySelector<HTMLButtonElement>('[aria-label="Link"]')!.click();
      else editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "k", [modifier]: true, bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('[aria-label="Link picker"]')).not.toBeNull();
    await act(async () => { editor.commands.setTextSelection(12); });
    const apply = [...container.querySelectorAll("button")].find((button) => button.textContent === "Apply link")!;
    await act(async () => apply.click());
    expect(editor.getHTML()).toContain('href="https://example.com">Hello</a> world');
    await act(async () => root.unmount());
    editor.destroy(); container.remove(); editorElement.remove(); vi.unstubAllGlobals();
  });

  it("shows a linked word's destination and supports Edit, Open and Remove without selecting text", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, UndoRedo, Link.configure({ openOnClick: false })],
      content: '<p><a href="https://example.com">Hello</a> world</p>',
    });
    vi.spyOn(editor.view.dom, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 200, 400, 80));
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    editor.commands.setTextSelection(3);
    await act(async () => root.render(<RichTextToolbar editor={editor} readOnly={false} floating />));
    await act(async () => focusText(editor));
    const popover = () => document.querySelector<HTMLElement>('[role="toolbar"][aria-label="Link"]')!;
    expect(popover().textContent).toContain("https://example.com");
    await act(async () => popover().querySelector<HTMLButtonElement>('[aria-label="Open"]')!.click());
    expect(open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    await act(async () => popover().querySelector<HTMLButtonElement>('[aria-label="Edit"]')!.click());
    expect(document.querySelector('[aria-label="Link picker"]')).not.toBeNull();
    await act(async () => {
      [...document.querySelectorAll("button")].find((button) => button.textContent === "Cancel link")!.click();
    });
    await act(async () => popover().querySelector<HTMLButtonElement>('[aria-label="Remove"]')!.click());
    expect(editor.getHTML()).toBe("<p>Hello world</p>");
    await act(async () => root.unmount());
    open.mockRestore(); editor.destroy(); container.remove(); vi.unstubAllGlobals();
  });

  it("shows on focus, stays anchored to the box while typing, and hides on Escape, outside click and blur", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const container = document.createElement("div"); document.body.append(container);
    const outside = document.createElement("button"); document.body.append(outside);
    const root = createRoot(container);
    const editor = new Editor({ extensions: [Document, Paragraph, Text, UndoRedo], content: "<p>Hello world</p>" });
    vi.spyOn(editor.view.dom, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 250, 500, 60));
    const caret = vi.spyOn(editor.view, "coordsAtPos");
    const toolbar = () => document.querySelector<HTMLElement>('[aria-label="Text formatting"]');
    await act(async () => root.render(<RichTextToolbar editor={editor} readOnly={false} floating />));
    expect(toolbar()).toBeNull();
    await act(async () => focusText(editor));
    expect(toolbar()).not.toBeNull();
    const top = toolbar()!.style.top;
    await act(async () => { editor.commands.insertContent("Typing"); });
    expect(toolbar()!.style.top).toBe(top);
    expect(caret).not.toHaveBeenCalled();
    await act(async () => { editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(toolbar()).toBeNull();
    await act(async () => { editor.view.dom.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    expect(toolbar()).not.toBeNull();
    await act(async () => { outside.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    expect(toolbar()).toBeNull();
    await act(async () => { editor.view.dom.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    await act(async () => outside.focus());
    expect(toolbar()).toBeNull();
    await act(async () => root.unmount());
    editor.destroy(); container.remove(); outside.remove(); vi.unstubAllGlobals();
  });

  it("keeps only the focused field's toolbar visible and retains it while using controls", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const first = new Editor({ extensions: [Document, Paragraph, Text, UndoRedo], content: "<p>First</p>" });
    const second = new Editor({ extensions: [Document, Paragraph, Text, UndoRedo], content: "<p>Second</p>" });
    await act(async () => root.render(<><RichTextToolbar editor={first} readOnly={false} /><RichTextToolbar editor={second} readOnly={false} /></>));
    await act(async () => focusText(first));
    expect(container.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
    await act(async () => container.querySelector<HTMLSelectElement>('[aria-label="Font size"]')!.focus());
    expect(container.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
    await act(async () => focusText(second));
    expect(container.querySelectorAll('[role="toolbar"]')).toHaveLength(1);
    await act(async () => root.unmount());
    first.destroy(); second.destroy(); container.remove(); vi.unstubAllGlobals();
  });

  it.each([{ y: 300, top: 172 }, { y: 10, top: 98 }])("positions outside the text box at y=$y within a tablet-sized visual viewport", async ({ y, top }) => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("visualViewport", Object.assign(new EventTarget(), { width: 768, height: 900, offsetLeft: 0, offsetTop: 0 }));
    const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(120);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const editor = new Editor({ extensions: [Document, Paragraph, Text, UndoRedo], content: "<p>Example</p>" });
    vi.spyOn(editor.view.dom, "getBoundingClientRect").mockReturnValue(new DOMRect(30, y, 400, 80));
    await act(async () => root.render(<RichTextToolbar editor={editor} readOnly={false} floating />));
    await act(async () => focusText(editor));
    const toolbar = document.querySelector<HTMLElement>('[aria-label="Text formatting"]')!;
    expect(toolbar.style.top).toBe(`${top}px`);
    expect(toolbar.style.width).toBe("744px");
    expect(toolbar.hasAttribute("data-puck-rte-menu")).toBe(true);
    await act(async () => root.unmount());
    scrollHeight.mockRestore(); editor.destroy(); container.remove(); vi.unstubAllGlobals();
  });

  it.each(["fontFamily", "fontSize", "color"])("applies %s to the current paragraph without a selection and preserves the caret", (attribute) => {
    const value = { fontFamily: "Inter", fontSize: "24px", color: "#123456" }[attribute]!;
    const editor = new Editor({ extensions: [Document, Paragraph, Text, TextAppearance], content: "<p>First block</p><p>Second block</p>" });
    editor.commands.setTextSelection(4);
    applyTextAppearance(editor, { [attribute]: value });
    expect(editor.state.selection.from).toBe(4);
    expect(editor.state.selection.empty).toBe(true);
    const json = editor.getJSON();
    expect(json.content![0].content![0].marks).toContainEqual({ type: "textAppearance", attrs: expect.objectContaining({ [attribute]: value }) });
    expect(json.content![1].content![0].marks).toBeUndefined();
    editor.destroy();
  });

  it("toggles bold and highlight for subsequent typing without changing existing text", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const editor = new Editor({ extensions: [Document, Paragraph, Text, UndoRedo, Bold, TextAppearance, TextLayout], content: "<p>Hello</p>" });
    editor.commands.setTextSelection(6);
    await act(async () => root.render(<RichTextToolbar editor={editor} readOnly={false} />));
    await act(async () => focusText(editor));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Bold"]')!.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Highlight"]')!.click();
      editor.commands.insertContent(" next");
    });
    expect(editor.getHTML()).toContain("<p>Hello");
    const text = editor.getJSON().content![0].content!;
    expect(text[0]).toMatchObject({ text: "Hello" });
    expect(text[0].marks).toBeUndefined();
    expect(text[1].marks).toContainEqual({ type: "bold" });
    expect(text[1].marks).toContainEqual({ type: "textAppearance", attrs: expect.objectContaining({ backgroundColor: "#fef08a" }) });
    await act(async () => root.unmount());
    editor.destroy(); container.remove(); vi.unstubAllGlobals();
  });
});
