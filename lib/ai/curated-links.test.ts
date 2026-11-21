import { describe, expect, it } from "vitest";
import { finalizeCuratedLinks } from "./curated-links";

describe("finalizeCuratedLinks", () => {
  const pages = [{ slug: "" }, { slug: "pricing" }, { slug: "contact" }];
  const contact = { phone: "", email: "" };

  it("anchors core sections and keeps links that resolve", () => {
    const content = finalizeCuratedLinks([
      { type: "Hero", props: { buttonLink: "#faq", secondaryButtonLink: "/pricing" } },
      { type: "Faq", props: { design: { settings: { width: "full" } } } },
      { type: "Process", props: { design: { settings: { anchorId: "how-it-works" } } } },
    ], pages, contact);
    expect(content[1].props.design).toEqual({ settings: { width: "full", anchorId: "faq" } });
    expect(content[2].props.design).toEqual({ settings: { anchorId: "how-it-works" } });
    expect(content[0].props).toEqual({ buttonLink: "#faq", secondaryButtonLink: "/pricing" });
  });

  it("redirects links to unselected pages and missing anchors at an existing destination", () => {
    const [hero, cta] = finalizeCuratedLinks([
      { type: "Hero", props: { buttonLink: "#process", secondaryButtonLink: "/services", plans: [{ buttonLink: "#pricing" }] } },
      { type: "CallToAction", props: { buttonLink: "", secondaryButtonLink: "https://example.com", design: { link: "/nowhere" } } },
    ], pages, contact);
    expect(hero.props).toEqual({ buttonLink: "/contact", secondaryButtonLink: "/contact", plans: [{ buttonLink: "/pricing" }] });
    expect(cta.props).toEqual({ buttonLink: "", secondaryButtonLink: "https://example.com", design: { link: "/nowhere" } });
    const [single] = finalizeCuratedLinks([{ type: "Hero", props: { buttonLink: "/contact" } }], [{ slug: "" }], { phone: "+1 (555) 0100", email: "" });
    expect(single.props.buttonLink).toBe("tel:+15550100");
  });
});
