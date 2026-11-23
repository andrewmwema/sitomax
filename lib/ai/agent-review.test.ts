import { describe, expect, it } from "vitest";
import {
  applyReviewPatches, createAgentReviewPayload, previewAgentReview, reviewPatches, undoReviewPatches,
} from "./agent-review";

describe("agent review patches", () => {
  const baseline = {
    pages: [{ id: "home", draft: { content: [
      { type: "Hero", props: { id: "hero", title: "Original", description: "Original" } },
      { type: "Text", props: { id: "text", title: "About" } },
    ] } }],
    theme: { primary: "#000000" },
  };

  it("replays independent changes to the same section without applying rejected changes", () => {
    const first = structuredClone(baseline);
    first.pages[0].draft.content[0].props.title = "Warmer";
    const second = structuredClone(first);
    second.pages[0].draft.content[0].props.description = "Friendly";
    const result = applyReviewPatches(baseline, reviewPatches(first, second));
    expect(result.pages[0].draft.content[0].props).toMatchObject({ title: "Original", description: "Friendly" });
    expect(baseline.pages[0].draft.content[0].props.description).toBe("Original");
  });

  it("replays moves and refuses to overwrite a manually edited collection", () => {
    const moved = structuredClone(baseline);
    moved.pages[0].draft.content.reverse();
    const patches = reviewPatches(baseline, moved);
    expect(applyReviewPatches(baseline, patches)).toEqual(moved);
    const edited = structuredClone(baseline);
    edited.pages[0].draft.content[0].props.title = "Manual edit";
    expect(() => applyReviewPatches(edited, patches)).toThrow("draft changed");
    expect(edited.pages[0].draft.content[0].props.title).toBe("Manual edit");
  });

  it("round-trips an image and alt-text change through persisted patches and undo", () => {
    const before = { pages: [{ id: "home", content: [{ props: { id: "hero", image: "/old.png", alt: "Old" } }] }] };
    const after = { pages: [{ id: "home", content: [{ props: { id: "hero", image: "/new.png", alt: "New" } }] }] };
    const patches = JSON.parse(JSON.stringify(reviewPatches(before, after)));
    expect(applyReviewPatches(before, patches)).toEqual(after);
    expect(undoReviewPatches(after, patches)).toEqual(before);
  });

  it("detects conflicting edits and distinguishes missing properties from null", () => {
    const before = { theme: { primary: "blue" } };
    const after = { theme: { primary: "green", accent: null } };
    const patches = reviewPatches(before, after);
    expect(applyReviewPatches(before, patches)).toEqual(after);
    expect(() => applyReviewPatches({ theme: { primary: "red" } }, patches)).toThrow("draft changed");
  });

  it("builds a preview-only payload without exposing unrelated snapshot data", () => {
    const changed = structuredClone(baseline);
    changed.theme.primary = "#008000";
    const changeset = {
      baseline: { ...baseline, header: {}, footer: {}, posts: [{ title: "Not needed for canvas" }] },
      working: { ...changed, header: {}, footer: {}, posts: [{ title: "Not needed for canvas" }] },
      changes: [{
        id: "theme-1", kind: "theme", label: "Update site theme",
        before: baseline.theme, after: changed.theme, patches: reviewPatches(baseline, changed),
      }],
    };

    const payload = createAgentReviewPayload(changeset);
    expect(payload?.baseline).not.toHaveProperty("posts");
    expect(payload?.changes[0]).not.toHaveProperty("before");
    expect(previewAgentReview(payload!, {}).snapshot?.theme).toEqual(changed.theme);
    expect(previewAgentReview(payload!, { "theme-1": "undone" }).snapshot?.theme).toEqual(baseline.theme);
  });

  it("rebases an included scalar change when an earlier overlapping change is undone", () => {
    const first = structuredClone(baseline);
    first.theme.primary = "green";
    const second = structuredClone(first);
    second.theme.primary = "blue";
    const payload = createAgentReviewPayload({
      baseline: { ...baseline, header: {}, footer: {} },
      working: { ...second, header: {}, footer: {} },
      changes: [
        { id: "first", kind: "theme", label: "First color", patches: reviewPatches(baseline, first) },
        { id: "second", kind: "theme", label: "Second color", patches: reviewPatches(first, second) },
      ],
    });

    expect(payload).not.toBeNull();
    expect(previewAgentReview(payload!, { first: "undone", second: "kept" }).snapshot?.theme.primary).toBe("blue");
  });

  it("reports when a kept change depends on an undone structural change", () => {
    const withPage = structuredClone(baseline);
    withPage.pages.push({ id: "about", title: "About", draft: { content: [] } });
    const renamed = structuredClone(withPage);
    renamed.pages[1].title = "Our story";
    const payload = createAgentReviewPayload({
      baseline: { ...baseline, header: {}, footer: {} },
      working: { ...renamed, header: {}, footer: {} },
      changes: [
        { id: "create", kind: "create_page", label: "Create page", patches: reviewPatches(baseline, withPage) },
        { id: "rename", kind: "page_settings", label: "Rename page", patches: reviewPatches(withPage, renamed) },
      ],
    });

    expect(payload).not.toBeNull();
    expect(previewAgentReview(payload!, { create: "undone", rename: "kept" }).error).toMatch(/depend on an undone change/i);
  });
});
