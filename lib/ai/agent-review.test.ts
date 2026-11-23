import { describe, expect, it } from "vitest";
import { applyReviewPatches, reviewPatches, undoReviewPatches } from "./agent-review";

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
});
