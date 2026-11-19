import { Extension, Mark } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";

const MARK_STYLES = {
  color: "color",
  backgroundColor: "background-color",
  fontFamily: "font-family",
  fontSize: "font-size",
} as const;

export const TextAppearance = Mark.create({
  name: "textAppearance",
  addAttributes() {
    return Object.fromEntries(Object.entries(MARK_STYLES).map(([name, css]) => [name, {
      default: null,
      parseHTML: (element: HTMLElement) => element.style.getPropertyValue(css) || null,
      renderHTML: (attrs: Record<string, string>) => attrs[name] ? { style: `${css}: ${attrs[name]}` } : {},
    }]));
  },
  parseHTML() { return [{ tag: "span[style]" }, { tag: "mark" }]; },
  renderHTML({ HTMLAttributes }) { return ["span", HTMLAttributes, 0]; },
});

export const TextLayout = Extension.create({
  name: "textLayout",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading", "blockquote"],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.lineHeight || null,
          renderHTML: (attrs: Record<string, string>) => attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {},
        },
        indent: {
          default: 0,
          parseHTML: (element: HTMLElement) => Math.min(128, Math.max(0, parseInt(element.style.marginLeft) || 0)),
          renderHTML: (attrs: Record<string, number>) => attrs.indent ? { style: `margin-left: ${attrs.indent}px` } : {},
        },
      },
    }];
  },
});

/** Keeps internal links tied to a page id so they survive slug changes (lib/links.ts). */
export const LinkPageId = Extension.create({
  name: "linkPageId",
  addGlobalAttributes() {
    return [{
      types: ["link"],
      attributes: {
        pageId: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-page-id"),
          renderHTML: (attrs: Record<string, string | null>) => attrs.pageId ? { "data-page-id": attrs.pageId } : {},
        },
      },
    }];
  },
});

export const WritingAssistantOptOut = Extension.create({
  name: "writingAssistantOptOut",
  onBeforeCreate() {
    const editorProps = this.editor.options.editorProps;
    const attributes = editorProps.attributes;
    this.editor.setOptions({
      editorProps: {
        ...editorProps,
        attributes: (state) => ({
          ...(typeof attributes === "function" ? attributes(state) : attributes),
          "data-gramm": "false",
          "data-gramm_editor": "false",
          "data-enable-grammarly": "false",
        }),
      },
    });
  },
});

export const editorTextExtensions = [TextAppearance, TextLayout, LinkPageId, WritingAssistantOptOut, UndoRedo];
