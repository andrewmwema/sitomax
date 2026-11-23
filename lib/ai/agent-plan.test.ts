import { describe, expect, it } from "vitest";
import { plainWords, withoutIds } from "./agent-plan";

describe("text the agent writes for the user", () => {
  it("is shown without the ids the agent works with, and otherwise as written", () => {
    for (const [text, shown] of [
      ["Rewrite the hero (sectionId: Hero-1a2b3c) on Home", "Rewrite the hero on Home"],
      ["Update pageId 00000000-0000-4000-8000-000000000010 title", "Update title"],
      ["Update the page 00000000-0000-4000-8000-000000000010 title", "Update the page title"],
      ['Home: restyle "Hero-00000000-0000-4000-8000-000000000020" and the footer', "Home: restyle and the footer"],
      ["Change section_id: home-hero.", "Change."],
      // "id" as an ordinary word is not an id.
      ["Give every post id-based anchors", "Give every post id-based anchors"],
      ["Fix the page ids 2 broken links", "Fix the page ids 2 broken links"],
      // Numbers, hyphens and the words page and section are left alone.
      ["Add 3 sections to the About page, and a 24-hour callout", "Add 3 sections to the About page, and a 24-hour callout"],
      ["Pricing page: redesign the pricing section", "Pricing page: redesign the pricing section"],
      ["Which page should the design ideas go on?", "Which page should the design ideas go on?"],
    ] as const) expect(withoutIds(text), text).toBe(shown);
    expect(plainWords({ steps: ["Home (pageId 00000000-0000-4000-8000-000000000010): new hero"], count: 2, rationale: undefined }))
      .toEqual({ steps: ["Home: new hero"], count: 2, rationale: undefined });
    expect(plainWords(["sectionId Hero-00000000-0000-4000-8000-000000000020", ""])).toEqual(["Another change", ""]);
  });
});
