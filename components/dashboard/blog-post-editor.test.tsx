// @vitest-environment jsdom
import { act, createContext, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BlogPostEditor } from "./blog-post-editor";

const mocks = vi.hoisted(() => ({ push: vi.fn(), save: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/puck/config", () => ({ puckConfig: { components: {} } }));
vi.mock("@/components/editor/media-picker", () => ({ MediaPicker: () => null }));
vi.mock("@/components/editor/image-upload-field", () => ({ EditorSiteContext: createContext(null) }));
vi.mock("@/app/(dashboard)/dashboard/sites/[siteId]/blog/actions", () => ({ saveBlogPost: mocks.save }));
vi.mock("@/app/(dashboard)/dashboard/sites/[siteId]/blog/ai-actions", () => ({ blogWriterAi: vi.fn() }));

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

it("returns to the originating editor page only after saving the current draft", async () => {
  const title = container.querySelector<HTMLInputElement>('input[placeholder="Give your post a title"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Revised title");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const back = [...container.querySelectorAll("button")].find((button) => button.textContent === "Back to editor")!;
  mocks.save.mockResolvedValueOnce({ status: "error", message: "Could not save" });
  await act(async () => back.click());
  expect(mocks.push).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Could not save");

  let finishSave!: (result: { status: "success" }) => void;
  mocks.save.mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve; }));
  await act(async () => back.click());
  expect(mocks.save).toHaveBeenLastCalledWith("first", expect.objectContaining({ title: "Revised title" }));
  expect(mocks.push).not.toHaveBeenCalled();
  await act(async () => finishSave({ status: "success" }));
  expect(mocks.push).toHaveBeenCalledWith("/editor/about");
});

it("carries the editor page through Posts and adjacent-post navigation", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Back to posts"]')!.click());
  expect(mocks.push).toHaveBeenLastCalledWith("/dashboard/sites/site/blog?editorPage=about");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next post"]')!.click());
  expect(mocks.push).toHaveBeenLastCalledWith("/dashboard/sites/site/blog/second?editorPage=about");
  expect(mocks.save).not.toHaveBeenCalled();
});
