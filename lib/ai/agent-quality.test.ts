import { describe, expect, it } from "vitest";
import { defaultHeader } from "@/lib/header";
import { puckConfig } from "@/lib/puck/config";
import { contrastRatio } from "@/lib/theme/presets";
import { checkQuality, type QualitySite } from "./agent-quality";

type Item = { type: string; props: Record<string, unknown> };
const aboutId = "00000000-0000-4000-8000-0000000000a1";
const defaults = (type: keyof typeof puckConfig.components) =>
  structuredClone(puckConfig.components[type].defaultProps) as Record<string, unknown>;
const element = (type: keyof typeof puckConfig.components, id: string, props: Record<string, unknown>): Item =>
  ({ type, props: { ...defaults(type), id, ...props } });
function layout(id: string, elements: Item[], design: Record<string, unknown> = {}): Item {
  return element("Section", id, { background: "default", design, rows: [element("Row", `${id}-row`, { columns: [
    element("Column", `${id}-column`, { content: elements }),
  ] })] });
}
function site(sections: Item[], overrides: Partial<QualitySite> = {}): QualitySite {
  return {
    theme: { colors: { background: "#ffffff", text: "#111111", primary: "#0055aa" } },
    header: defaultHeader("Example"), footer: defaults("Footer"),
    pages: [
      { id: "home", slug: "", title: "Home", nav_label: "Home", draft_data: { content: sections } },
      { id: aboutId, slug: "about", title: "About", nav_label: "About", draft_data: { content: [
        element("Hero", "about-hero", { heading: "About", buttonText: "", buttonLink: "", secondaryButtonText: "", secondaryButtonLink: "",
          design: { settings: { anchorId: "team" } } }),
      ] } },
    ],
    ...overrides,
  };
}
const elementsOf = (value: QualitySite, sectionIndex = 0) => {
  const section = (value.pages[0].draft_data as { content: Item[] }).content[sectionIndex];
  return ((section.props.rows as Item[])[0].props.columns as Item[])[0].props.content as Item[];
};
const heading = element("Heading", "heading", { text: "Welcome" });

describe("AI agent changeset quality check", () => {
  it("repairs problems the changes introduced and leaves earlier ones alone", () => {
    const before = site([
      layout("old", [element("Text", "old-empty", { text: "<p> </p>" }), heading]),
      layout("styled", [heading], { appearance: { desktop: { textColor: "#222222" } } }),
    ]);
    const after = structuredClone(before);
    // A darker theme makes an existing text colour unreadable, and new empty elements were added.
    after.theme = { colors: { background: "#101820", text: "#f5f5f5", primary: "#0055aa" } };
    elementsOf(after).push(element("Text", "new-empty", { text: "" }), element("Button", "new-button", { label: " ", href: "/about" }));
    after.pages[1].nav_label = "A label that is far too long";

    const { site: fixed, fixedPages, report } = checkQuality(before, after);
    expect(elementsOf(fixed).map((item) => item.props.id)).toEqual(["old-empty", "heading"]);
    const design = (fixed.pages[0].draft_data as { content: Item[] }).content[1].props.design as { appearance: { desktop: { textColor: string } } };
    expect(contrastRatio(design.appearance.desktop.textColor, "#101820")).toBeGreaterThanOrEqual(4.5);
    expect(fixed.pages[1].nav_label).toBe("About");
    expect([...fixedPages.keys()]).toEqual(["home", aboutId]);
    expect(report.fixed).toEqual([
      "Home: adjusted 1 text colour to stay readable, removed 2 empty text blocks or buttons.",
      "About: replaced a menu label that could not be used.",
    ]);
    expect(report.notes).toEqual([]);
    // The input is left as it was, and a second pass has nothing left to do.
    expect(elementsOf(after)).toHaveLength(4);
    expect(checkQuality(before, fixed).report).toEqual({ fixed: [], notes: [] });
  });

  it("reports new links that lead nowhere and placeholders, but not ones that were already there", () => {
    const before = site([layout("main", [
      element("Button", "old-broken", { label: "Old", href: "/missing" }),
      element("Text", "old-text", { text: "<p>Call [phone]</p>" }),
    ])]);
    const after = structuredClone(before);
    elementsOf(after).push(
      element("Button", "good-path", { label: "About", href: "/about#team" }),
      element("Button", "good-typed", { label: "Team", href: { type: "page", pageId: aboutId, anchor: "team" } }),
      element("Button", "good-blog", { label: "News", href: "/blog/welcome" }),
      element("Button", "good-external", { label: "Map", href: "https://example.com/map" }),
      element("Button", "bad-path", { label: "Pricing", href: "/pricing" }),
      element("Button", "bad-anchor", { label: "Jump", href: "#nowhere" }),
      element("Button", "bad-typed", { label: "Gone", href: { type: "page", pageId: "00000000-0000-4000-8000-0000000000ff" } }),
      element("Button", "bad-empty", { label: "Book now", href: "" }),
      element("Text", "new-text", { text: "<p>Founded in [year] by [founder]. Call [phone].</p>" }),
    );
    after.pages[1].seo = { title: "About [business name]" };
    const { fixedPages, report } = checkQuality(before, after);
    expect(fixedPages.size).toBe(0);
    expect(report.fixed).toEqual([]);
    expect(report.notes).toEqual([
      "Home › Button: the button “Pricing” links to /pricing, which is not a page on this site.",
      "Home › Button: the button “Jump” links to #nowhere, which is not a section on this page.",
      "Home › Button: the button “Gone” links to a page that is not on this site.",
      "Home › Button: the button “Book now” has no link.",
      "Home: 3 placeholders to fill in before publishing: [year], [founder], [phone].",
      "About (page title and SEO): 1 placeholder to fill in before publishing: [business name].",
    ]);
  });

  it("flags menu clashes, a crowded menu and broken header links", () => {
    const before = site([layout("main", [heading])]);
    const after = structuredClone(before);
    after.pages.push(...["Services", "Pricing", "Team", "Gallery", "Reviews", "Contact"].map((title) =>
      ({ id: title, slug: title.toLowerCase(), title, nav_label: title === "Team" ? "about" : title, draft_data: { content: [] } })));
    const header = defaultHeader("Example");
    after.header = { ...header, menu: { source: "custom", items: [{ label: "Old page", href: "/old", children: [] }] } };
    expect(checkQuality(before, after).report.notes).toEqual([
      "Menu: more than one page is called “about”.",
      "Header: a menu link links to /old, which is not a page on this site.",
      "Menu: there are now 8 pages in the menu. Consider hiding some so it fits on small screens.",
    ]);
    // A menu that was already crowded is not reported again, least of all when it got shorter.
    const shorter = structuredClone(after);
    shorter.pages.at(-1)!.hide_from_menu = true;
    expect(checkQuality(after, shorter).report.notes).toEqual([]);
  });

  it("leaves text alone where its background is not known: over media and inside curated blocks", () => {
    const white = () => ({ appearance: { desktop: { textColor: "#ffffff" }, mobile: { textColor: "#ffffff" } } });
    const bare = { heading: "Welcome", buttonText: "", buttonLink: "", secondaryButtonText: "", secondaryButtonLink: "", stats: [] };
    const before = site([layout("main", [heading])]);
    const after = structuredClone(before);
    const sections = (after.pages[0].draft_data as { content: Item[] }).content;
    sections.push(
      // White text over a photo with a dark overlay, as the agent's design tool sets it.
      layout("photo", [heading], { ...white(), background: { type: "image", images: ["/samples/hero.jpg"], overlayColor: "#000", overlayOpacity: 80 } }),
      element("Hero", "hero", { ...bare, design: { ...white(), background: { type: "video", video: {} } } }),
      // A curated block draws its own backgrounds, which the check cannot see.
      element("Hero", "plain-hero", { ...bare, design: white() }),
      // Inside a section with a known colour of its own, white text is judged against that colour.
      layout("navy", [heading], { ...white(), background: { type: "color", color: "#0b2545" } }),
      layout("pale", [heading], { ...white(), background: { type: "color", color: "#f5f5f5" } }),
    );
    const { site: fixed, report } = checkQuality(before, after);
    const colors = (fixed.pages[0].draft_data as { content: Item[] }).content.slice(1)
      .map((item) => (item.props.design as ReturnType<typeof white>).appearance.desktop.textColor);
    expect(colors.slice(0, 4)).toEqual(["#ffffff", "#ffffff", "#ffffff", "#ffffff"]);
    expect(contrastRatio(colors[4], "#f5f5f5")).toBeGreaterThanOrEqual(4.5);
    expect(report).toEqual({ fixed: ["Home: adjusted 1 text colour to stay readable."], notes: [] });
  });

  it("does not blame the changes for old problems that moved, or mistake blog lists for placeholders", () => {
    const plan = (name: string, buttonLink: string) =>
      ({ name, description: "", price: "", period: "", yearlyPrice: "", yearlyPeriod: "", features: "", buttonText: "Sign up", buttonLink, highlighted: false });
    const before = site([element("Pricing", "pricing", { plans: [plan("Basic", "/old-signup")] })]);
    const after = structuredClone(before);
    ((after.pages[0].draft_data as { content: Item[] }).content[0].props.plans as unknown[]).unshift(plan("Starter", "/about"));
    after.posts = [{ id: "post", title: "Frozen pipes", excerpt: "", draft_content: { version: 1, blocks: [
      { type: "list", ordered: false, items: ["Insulate pipes", "Find the stopcock"] },
      { type: "table", rows: [["Job", "Time"], ["Lagging", "1 hour"]] },
      { type: "paragraph", html: "<p>Call us on [phone number].</p>" },
    ] } }];
    expect(checkQuality(before, after).report).toEqual({
      fixed: [], notes: ["Blog post “Frozen pipes”: 1 placeholder to fill in before publishing: [phone number]."],
    });
  });
});
