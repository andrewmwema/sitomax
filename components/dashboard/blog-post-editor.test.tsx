// @vitest-environment jsdom
import { act, createContext, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import { BlogPostEditor } from "./blog-post-editor";

const mocks = vi.hoisted(() => ({ push: vi.fn(), save: vi.fn(), ai: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));
vi.mock("@/components/editor/media-picker", () => ({ MediaPicker: () => null }));
vi.mock("@/components/editor/image-upload-field", () => ({ EditorSiteContext: createContext(null) }));
vi.mock("@/app/(dashboard)/dashboard/sites/[siteId]/blog/actions", () => ({ saveBlogPost: mocks.save }));
vi.mock("@/app/(dashboard)/dashboard/sites/[siteId]/blog/ai-actions", () => ({ blogWriterAi: mocks.ai }));

const props: ComponentProps<typeof BlogPostEditor> = {
  siteId: "site", postId: "first", editorPageId: "about",
  initialTab: "status", headingFont: "Inter", bodyFont: "Inter",
  status: "draft", publishedAt: null, publishAt: null, hasScheduledSnapshot: false, hasUnpublishedChanges: false,
  timezone: "UTC", categories: [], authors: [], tags: [],
  adjacentPosts: [{ id: "first", title: "First" }, { id: "second", title: "Second" }],
  post: {
    title: "First", slug: "first", subtitle: "", excerpt: "", draft_content: { version: 1, blocks: [] },
    cover_image: "", cover_alt: "", thumbnail_image: "", thumbnail_alt: "", author_id: null,
    category_id: null, tag_ids: [], featured: false, layout_override: null, seo_title: "",
    seo_description: "", canonical_url: "", noindex: false,
  },
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<BlogPostEditor {...props} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("opens the originating editor in a new tab without navigating away from the post draft", async () => {
  const title = container.querySelector<HTMLInputElement>('input[placeholder="Give your post a title"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Revised title");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const back = container.querySelector<HTMLAnchorElement>('a[href="/editor/about"]')!;
  expect(back.target).toBe("_blank");
  expect(back.rel).toBe("noopener noreferrer");
  expect(title.value).toBe("Revised title");
  expect(mocks.push).not.toHaveBeenCalled();
});

it("carries the editor page through Posts and adjacent-post navigation", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Back to posts"]')!.click());
  expect(mocks.push).toHaveBeenLastCalledWith("/dashboard/sites/site/blog?editorPage=about");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next post"]')!.click());
  expect(mocks.push).toHaveBeenLastCalledWith("/dashboard/sites/site/blog/second?editorPage=about");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("saves rich formatting without stripping an imported link", async () => {
  const content = { version: 1 as const, blocks: [{ type: "paragraph" as const, html: '<p>Hello <a href="/contact">there</a></p>' }] };
  await act(async () => root.render(<BlogPostEditor key="formatted" {...props} post={{ ...props.post, draft_content: content }} />));
  const body = container.querySelector<HTMLElement & { editor: Editor }>('[aria-label="Post body text"]')!;
  expect(body.querySelector("a")?.getAttribute("href")).toBe("/contact");
  await act(async () => {
    body.editor.setOptions({ editorProps: { ...body.editor.options.editorProps, handleScrollToSelection: () => true } });
    body.editor.commands.setTextSelection({ from: 1, to: 6 });
  });
  await clickButton("Bold");
  expect(body.querySelector("strong")?.textContent).toBe("Hello");
  mocks.save.mockResolvedValue({ status: "success" });
  await clickButton("Save draft");
  expect(mocks.save).toHaveBeenLastCalledWith("first", expect.objectContaining({
    draft_content: { version: 1, blocks: [{ type: "paragraph", html: expect.stringMatching(/<strong>Hello<\/strong> <a [^>]*href="\/contact">there<\/a>/) }] },
  }));
});

it("applies an AI rewrite only to the selection, preserving surrounding formatting", async () => {
  const content = { version: 1 as const, blocks: [{ type: "paragraph" as const, html: "<p><strong>Hello</strong> original <em>world</em></p>" }] };
  await act(async () => root.render(<BlogPostEditor key="rewrite" {...props} post={{ ...props.post, draft_content: content }} />));
  const body = container.querySelector<HTMLElement & { editor: Editor }>('[aria-label="Post body text"]')!;
  await act(async () => { body.editor.commands.setTextSelection({ from: 7, to: 15 }); });
  mocks.ai.mockResolvedValue({ status: "success", result: { mode: "rewrite", text: "updated", notes: [] } });
  await clickButton("Rewrite selection");
  await clickButton("Preview rewrite");
  expect(mocks.ai).toHaveBeenCalledWith(expect.objectContaining({ text: "original" }));
  await clickButton("Apply rewrite");
  expect(body.innerHTML).toBe("<p><strong>Hello</strong> updated <em>world</em></p>");
});

it("inserts a validated button after an existing block and shows it in preview", async () => {
  await clickButton("Add text");
  await clickButton("Insert block here");
  await clickButton("Button");
  await fill('input[placeholder="Learn more"]', "Contact us");
  await fill('input[placeholder="/contact or https://…"]', "javascript:alert(1)");
  await clickButton("Insert button");
  expect(container.querySelector("form [role='alert']")?.textContent).toContain("safe URL");
  await fill('input[placeholder="/contact or https://…"]', "/contact");
  await clickButton("Insert button");
  mocks.save.mockResolvedValue({ status: "success" });
  await clickButton("Save draft");
  expect(mocks.save).toHaveBeenLastCalledWith("first", expect.objectContaining({
    draft_content: { version: 1, blocks: [{ type: "paragraph", html: "" }, { type: "button", text: "Contact us", href: "/contact" }] },
  }));
  await clickButton("Preview");
  expect(container.querySelector('a[href="/contact"]')?.textContent).toBe("Contact us");
});

async function clickButton(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

async function fill(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
