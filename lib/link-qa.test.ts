import { describe, expect, it } from "vitest";
import { findBrokenLinks } from "./link-qa";

const HOME = "11111111-1111-4111-8111-111111111111";
const ABOUT = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";
const pages = [
  { id: HOME, slug: "" },
  { id: ABOUT, slug: "about", sections: [{ index: 0, id: "a", anchor: "team", label: "Team" }] },
];
const section = (type: string, props: Record<string, unknown>) => ({ type, props: { id: `${type}-1`, ...props } });

describe("findBrokenLinks", () => {
  it("accepts valid typed, legacy and rich text links", () => {
    const data = { content: [
      section("Hero", { buttonLink: { type: "page", pageId: ABOUT, anchor: "team" }, secondaryButtonLink: "#pricing" }),
      section("Pricing", { design: { settings: { anchorId: "pricing" } }, plans: [{ buttonLink: "/about#team" }] }),
      section("TextSection", { body: `<p><a href="/about" data-page-id="${ABOUT}">About</a> <a href="mailto:a@b.co">Mail</a></p>` }),
    ] };
    expect(findBrokenLinks(data, { pages, currentPageId: HOME })).toEqual([]);
  });

  it("flags deleted pages, missing anchors and invalid URLs, including nested slots and rich text", () => {
    const data = { content: [
      section("Hero", { buttonLink: { type: "page", pageId: GONE } }),
      section("CallToAction", { buttonLink: { type: "page", pageId: ABOUT, anchor: "nope" }, secondaryButtonLink: "#missing" }),
      section("Row", { columns: [{ type: "Column", props: { content: [{ type: "Button", props: { href: "javascript:alert(1)" } }] } }] }),
      section("TextSection", { body: `<a href="/old-page">Old</a> <a href="#" data-page-id="${GONE}">x</a>` }),
    ] };
    const issues = findBrokenLinks(data, { pages, currentPageId: HOME, labels: { Hero: "Hero" } });
    expect(issues).toEqual([
      { index: 0, label: "Hero", problem: "Hero links to a deleted page" },
      { index: 1, label: "CallToAction", problem: "CallToAction links to a missing section (#nope)" },
      { index: 1, label: "CallToAction", problem: "CallToAction links to a missing section (#missing)" },
      { index: 2, label: "Row", problem: "Button has an invalid link" },
      { index: 3, label: "TextSection", problem: "TextSection links to a deleted page" },
    ]);
  });

  it("resolves page links after a slug change because they are stored by id", () => {
    const data = { content: [section("Hero", { buttonLink: { type: "page", pageId: ABOUT } })] };
    const renamed = pages.map((page) => page.id === ABOUT ? { ...page, slug: "about-us" } : page);
    expect(findBrokenLinks(data, { pages: renamed, currentPageId: HOME })).toEqual([]);
  });
});
