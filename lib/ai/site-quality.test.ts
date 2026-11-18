import { describe, expect, it } from "vitest";
import { emptyBusiness } from "@/lib/business";
import { reviewGeneratedPage } from "./site-quality";

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
});
