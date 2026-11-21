import { describe, expect, it } from "vitest";
import { curatedPlanContract } from "./curated-plan";
import { customPlanContract } from "./custom-layout";
import { pageFillContract } from "./site-schemas";
import type { GenerationInput } from "./site-input";

type Slug = GenerationInput["desiredPages"][number];
const PRESETS: Slug[] = ["", "about", "services", "features", "pricing", "portfolio", "faq", "team", "testimonials", "contact"];
const theme = { colors: { primary: "#123456", secondary: "#aabbcc", background: "#ffffff", text: "#111111" }, fonts: { heading: "Inter", body: "Inter" } };
const selection = (desiredPages: Slug[], desiredSections: GenerationInput["desiredSections"] = []) => ({
  style: "auto" as const, fontDirection: "auto" as const, desiredPages, desiredSections, pageDetails: [], businessName: "Local Plumbing",
});
const key = (slug: string) => slug || "home";

const CURATED_CORE: Record<string, string[]> = {
  "": ["Services", "Testimonials"], about: ["ImageWithText"], services: ["Services"], features: ["Services"],
  pricing: ["Pricing", "Faq"], portfolio: ["Gallery"], faq: ["Faq"], team: ["Team"], testimonials: ["Testimonials"], contact: ["ContactForm"],
};
const CUSTOM_CORE: Record<string, string[]> = {
  "": ["hero"], about: ["hero"], services: ["services"], features: ["services"], pricing: ["pricing"],
  portfolio: ["gallery"], faq: ["faq"], team: ["team"], testimonials: ["testimonials"], contact: ["contact"],
};
const cases = [{ name: "all presets together", pages: PRESETS }, ...PRESETS.map((slug) => ({ name: key(slug), pages: [slug] }))];

describe("selected-page plan validation for every preset page type", () => {
  describe.each(cases)("$name", ({ pages }) => {
    it("curated: builds the exact pages with complete conversion layouts, even from empty proposals", () => {
      const { schema } = curatedPlanContract(selection(pages, ["faq", "pricing"]));
      const plan = schema.parse({ style: "modern", ...theme,
        pages: pages.map((slug) => ({ page: key(slug), title: "", seo: { title: "", description: "" }, sections: [] })) });
      expect(plan.pages.map(({ slug }) => slug)).toEqual(pages);
      for (const page of plan.pages) {
        const types = page.sections.map(({ blockType }) => blockType);
        expect(types[0]).toBe("Hero");
        expect(types.at(-1)).toBe("Footer");
        expect(types.length).toBeGreaterThanOrEqual(5);
        expect(types.length).toBeLessThanOrEqual(8);
        expect(types).toEqual(expect.arrayContaining(CURATED_CORE[page.slug]));
        expect(types.some((type) => type === "CallToAction" || type === "ContactForm")).toBe(true);
        expect(new Set(page.sections.map(({ designId }) => designId)).size).toBe(types.length);
        expect(page.seo?.title.length).toBeGreaterThan(0);
        expect(() => pageFillContract(page)).not.toThrow();
      }
      const owners = plan.pages.filter(({ sections }) => sections.some(({ blockType }) => blockType === "Pricing")).map(({ slug }) => slug);
      expect(owners).toEqual([pages.includes("pricing") ? "pricing" : pages.includes("services") ? "services"
        : pages.includes("features") ? "features" : pages.includes("") ? "" : pages[0]]);
    });

    it("custom: builds the exact pages with preset default sections when the plan omits them", () => {
      const { schema } = customPlanContract(selection(pages));
      const plan = schema.parse({ style: "modern", ...theme, pages: {} });
      expect(plan.pages.map(({ slug }) => slug)).toEqual(pages);
      for (const page of plan.pages) {
        const kinds = page.sections.map(({ kind }) => kind);
        expect(kinds[0]).toBe("hero");
        expect(kinds.at(-1)).toBe("footer");
        expect(kinds.length).toBeGreaterThanOrEqual(3);
        expect(kinds).toEqual(expect.arrayContaining(CUSTOM_CORE[page.slug]));
      }
    });
  });

  it("rejects curated page keys outside the user's selection", () => {
    const { schema } = curatedPlanContract(selection(["", "pricing"]));
    expect(schema.safeParse({ style: "modern", ...theme,
      pages: [{ page: "about", title: "", seo: { title: "", description: "" }, sections: [] }] }).success).toBe(false);
  });
});
