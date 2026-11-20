import { describe, expect, it } from "vitest";
import { emptyBusiness } from "@/lib/business";
import { generatedPageIssues, reviewGeneratedPage } from "./site-quality";
import { sharedSiteFooter } from "./site-footer";

describe("AI draft review", () => {
  it("fixes duplicate sections, empty text and textual links; reports page-specific issues", () => {
    const hero = { type: "Section", props: { id: "first",
      design: { background: { type: "color", color: "#ffffff" }, appearance: { desktop: { textColor: "#eeeeee" } } }, rows: [
      { type: "Row", props: { columns: [{ type: "Column", props: { content: [
        { type: "Text", props: { text: "<p>Services: /services</p>" } },
        { type: "Text", props: { text: "<p>&nbsp;</p>" } },
        { type: "Text", props: { text: "<p>[Benefit] [Benefit] or wrong@example.test</p>" } },
        { type: "Button", props: { href: "/missing", label: "Broken" } },
        { type: "Image", props: { src: "/samples/photo.jpg", alt: "" } },
      ] } }] } },
    ] } };
    const review = reviewGeneratedPage([hero, { ...hero, props: { ...hero.props, id: "second" } }], {
      slug: "", pages: [{ slug: "" }, { slug: "services" }], business: emptyBusiness,
    });
    expect(review.content).toHaveLength(1);
    expect(JSON.stringify(review.content)).toContain('"type":"Button","props":{"label":"Services","href":"/services"');
    expect(JSON.stringify(review.content)).not.toMatch(/&nbsp;|\/missing/);
    expect(review.notes).toEqual(expect.arrayContaining([
      expect.stringContaining("Home: 1 empty"), expect.stringContaining("1 duplicate"), expect.stringContaining("1 broken"),
      expect.stringContaining("1 contact detail"), expect.stringContaining("1 image"), expect.stringContaining("2 placeholder"),
      expect.stringContaining("1 block(s) had low-contrast"),
    ]));
  });

  it("keeps rendered section anchors, not internal Puck IDs", () => {
    const review = reviewGeneratedPage([
      { type: "Section", props: { id: "puck-uuid", design: { settings: { anchorId: "#Offers" } } } },
      { type: "Button", props: { label: "See offers", href: "#offers" } },
      { type: "Button", props: { label: "Internal ID", href: "#puck-uuid" } },
    ], { slug: "", pages: [{ slug: "" }], business: emptyBusiness });
    expect(review.content.filter(({ type }) => type === "Button")).toEqual([
      { type: "Button", props: { label: "See offers", href: "#offers" } },
    ]);
  });

  it("normalizes the first custom heading to H1 and prevents duplicates and skipped levels", () => {
    const review = reviewGeneratedPage(["h2", "h1", "h4", "h4"].map((level, index) => ({
      type: "Heading", props: { text: `Heading ${index}`, level },
    })), { slug: "", pages: [{ slug: "" }], business: emptyBusiness });
    expect(review.content.map(({ props }) => props.level)).toEqual(["h1", "h2", "h3", "h4"]);
    const body = reviewGeneratedPage([{ type: "TextSection", props: { text: "<h1>Body subheading</h1><p>Copy.</p>" } }],
      { slug: "", pages: [{ slug: "" }], business: emptyBusiness });
    expect(body.content[0].props.text).toBe("<h2>Body subheading</h2><p>Copy.</p>");
  });

  it("requires real supporting copy, a single H1, a body action and a final footer", () => {
    const heading = { type: "Heading", props: { text: "Welcome", level: "h1" } };
    const footer = { type: "Footer", props: {} };
    const button = { type: "Button", props: { label: "Next", href: "/contact" } };
    const text = (words: number) => ({ type: "Text", props: { text: `<p>${"word ".repeat(words)}</p>` } });
    expect(generatedPageIssues([heading, footer])).toEqual(expect.arrayContaining([
      expect.stringContaining("supporting copy"), expect.stringContaining("next-step"),
    ]));
    expect(generatedPageIssues([heading, text(29), button, footer])).toHaveLength(1);
    expect(generatedPageIssues([heading, text(30), button, footer])).toEqual([]);
    expect(generatedPageIssues([heading, { type: "Text", props: { text: `<h2>${"Heading ".repeat(30)}</h2>` } }, button, footer]))
      .toContain("Write at least 30 words of substantive supporting copy, excluding headings, menus and placeholders.");
    expect(generatedPageIssues([heading, heading, text(30), button, footer])).toContain("Use exactly one nonempty H1 page heading.");
    expect(generatedPageIssues([heading, { type: "Text", props: { text: "[Add real business details] ".repeat(30) } }, button, footer]))
      .toContain("Write at least 30 words of substantive supporting copy, excluding headings, menus and placeholders.");
    const broken = reviewGeneratedPage([{ type: "Hero", props: { heading: "Welcome", subheading: "word ".repeat(30),
      buttonText: "Missing", buttonLink: "/missing" } }, footer], { slug: "", pages: [{ slug: "" }], business: emptyBusiness });
    expect(generatedPageIssues(broken.content)).toContain("Include a working next-step button or contact form in the page body.");
  });

  it("reuses the Home draft footer before peers or published versions without sharing IDs or mutable props", () => {
    const pages = [
      { slug: "about", draft_data: { content: [{ type: "Footer", props: { variant: "compact" } }] } },
      { slug: "", draft_data: { content: [{ type: "Footer", props: { variant: "centered", socialLinks: [] } }] },
        published_data: { content: [{ type: "Footer", props: { variant: "columns" } }] } },
    ];
    const first = sharedSiteFooter(pages), second = sharedSiteFooter(pages);
    expect(first.props.variant).toBe("centered");
    expect(first.props.id).not.toBe(second.props.id);
    expect(first.props.socialLinks).not.toBe(second.props.socialLinks);
    expect(sharedSiteFooter([{ slug: "", published_data: pages[0].draft_data }]).props.variant).toBe("compact");
  });
});
