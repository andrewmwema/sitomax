import { existsSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckConfig, type PuckPageData } from "@/lib/puck/config";
import { sanitizePuckData } from "@/lib/richtext";
import { sectionCatalog, type SectionCategory } from "./catalog";
import { findUnreplacedPlaceholders } from "./placeholders";

type Block = keyof typeof puckConfig.components;
const counts: Partial<Record<SectionCategory, number>> = {
  Testimonials: 4, Logos: 2, Team: 3, "Call to action": 4,
  Contact: 3, Footer: 3, About: 3, Process: 3, Gallery: 3,
};
const designs = sectionCatalog.filter((design) => design.category in counts);

function dataFor(type: Block, props: Record<string, unknown>): PuckPageData {
  return {
    root: { props: {} },
    content: [{ type, props: { ...puckConfig.components[type].defaultProps, ...props, id: "batch-four-five-test" } }],
  } as PuckPageData;
}

function render(type: Block, props: Record<string, unknown>, style = "classic") {
  return renderToStaticMarkup(createElement(Render, {
    config: puckConfig, data: dataFor(type, props), metadata: { theme: { style } },
    fieldTransforms: { richtext: ({ value }) => value },
  }));
}

describe("Batches 4 and 5", () => {
  it("renders all 28 distinct designs through SectionShell in both styles with complete sample assets", () => {
    for (const [category, count] of Object.entries(counts)) {
      const entries = designs.filter((design) => design.category === category);
      expect(entries, category).toHaveLength(count);
      expect(new Set(entries.map((entry) => `${entry.blockType}:${entry.props.variant}`)).size, category).toBe(count);
    }
    for (const design of designs) {
      for (const style of ["classic", "modern"]) {
        const html = render(design.blockType as Block, design.props, style);
        expect(html, design.id).toContain("section-shell");
        const heading = design.category === "Footer" ? "[Business name]" : String(design.props.heading);
        expect(html, design.id).toContain(heading.replaceAll("'", "&#x27;"));
        for (const image of html.matchAll(/src="(\/samples\/[^"]+)"/g)) {
          expect(existsSync(path.join(process.cwd(), "public", image[1])), image[1]).toBe(true);
        }
        if (["Team", "About", "Gallery"].includes(design.category)) expect(html, design.id).toMatch(/<img/);
      }
    }
  });

  it("keeps every sample endorsement bracketed and warns even after names and roles are replaced", () => {
    for (const design of designs.filter((entry) => entry.category === "Testimonials")) {
      const reviews = design.props.testimonials as { quote: string; name: string; role: string }[];
      expect(reviews.every((review) => /^\[.+\]$/.test(review.quote))).toBe(true);
      const data = dataFor("Testimonials", {
        ...design.props,
        testimonials: reviews.map((review) => ({ ...review, name: "Real customer", role: "Customer" })),
      });
      expect(findUnreplacedPlaceholders(data), design.id).toHaveLength(1);
    }
    expect(findUnreplacedPlaceholders(dataFor("Testimonials", {
      testimonials: [{ quote: `[${"A long customer quotation. ".repeat(6)}\nContinued.]`, name: "Customer", role: "" }],
    }))).toHaveLength(1);
  });

  it("preserves all existing people, steps and reviews across layout changes", () => {
    const cases: { block: Block; id: string; key: string; name: string; variants: string[] }[] = [
      { block: "Team", id: "team-photo-cards", key: "members", name: "name", variants: ["cards", "profiles", "featured"] },
      { block: "Process", id: "process-step-cards", key: "steps", name: "title", variants: ["steps", "timeline", "checklist"] },
      { block: "Testimonials", id: "testimonials-cards", key: "testimonials", name: "name", variants: ["cards", "quotes", "carousel", "rating"] },
    ];
    for (const item of cases) {
      const props = sectionCatalog.find((design) => design.id === item.id)!.props;
      const before = JSON.stringify(props);
      for (const variant of item.variants) {
        const html = render(item.block, { ...props, variant });
        for (const entry of props[item.key] as Record<string, string>[]) expect(html).toContain(entry[item.name]);
      }
      expect(JSON.stringify(props)).toBe(before);
    }
  });

  it("renders accessible carousel controls without autoplay or nested buttons", () => {
    const props = sectionCatalog.find((design) => design.id === "testimonials-carousel")!.props;
    const html = render("Testimonials", props);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html.match(/aria-roledescription="slide"/g)).toHaveLength(3);
    expect(html).toContain('aria-live="polite"');
    expect(html).toMatch(/aria-label="Previous testimonial"[^>]*disabled/);
    expect(html).toContain('aria-label="Next testimonial"');
    expect(html).not.toContain("autoplay");
    const empty = render("Testimonials", { ...props, testimonials: [] });
    expect(empty).not.toContain('aria-roledescription="carousel"');
    const single = render("Testimonials", { ...props, testimonials: [{ quote: "Verified quote", name: "Customer", role: "" }] });
    expect(single).toContain("1 / 1");
    expect(single).toMatch(/aria-label="Next testimonial"[^>]*disabled/);
  });

  it("shares labelled enquiry forms with native validation and the existing submission contract", () => {
    const forms = designs.filter((design) => design.blockType === "ContactForm" || design.props.variant === "form");
    expect(forms).toHaveLength(4);
    for (const design of forms) {
      const html = render(design.blockType as Block, design.props);
      expect(html).toMatch(/<form[^>]*action="\/api\/forms\/submit"/);
      expect(html).toMatch(/<form[^>]*method="post"/);
      expect(html).toContain('name="_form_name"');
      expect(html).toContain('name="_website"');
      expect(html).toMatch(/<label[^>]*>[\s\S]*?<input[^>]*type="email"[^>]*required/);
      expect(html).toMatch(/<label[^>]*>[\s\S]*?<textarea[^>]*required/);
      expect(html).toContain('type="submit"');
      expect(html).not.toContain('id="field-0"');
    }
  });

  it("supports uploaded logos, captioned galleries, footer navigation and legacy layouts", () => {
    const logos = render("Logos", { logos: [{ name: "Actual partner", image: "/samples/tools.jpg" }] });
    expect(logos).toContain('alt="Actual partner"');
    const gallery = render("Gallery", { variant: "featured", images: [{ url: "/samples/kitchen.jpg", alt: "Kitchen", caption: "A new gathering place" }] });
    expect(gallery).toContain("<figcaption");
    expect(gallery).toContain("A new gathering place");
    const footer = render("Footer", {
      businessName: "Actual business", phone: "0123 456 789", email: "hello@example.com",
      navigation: [{ label: "Visit us", href: "/visit" }], variant: "columns",
    });
    expect(footer).toContain('href="tel:0123456789"');
    expect(footer).toContain('href="mailto:hello@example.com"');
    expect(footer).toContain('href="/visit"');
    expect(render("CallToAction", { variant: "split", heading: "Saved heading", buttonText: "Saved action" })).toContain("Saved action");
    expect(render("ImageWithText", { variant: "image-right", heading: "Existing story" })).toContain("Existing story");
  });

  it("sanitizes new team biographies, process steps and contact introductions", () => {
    const team = sanitizePuckData(dataFor("Team", { members: [{ name: "Person", bio: '<p onclick="alert(1)">Biography</p><script>alert(1)</script>' }] }));
    const process = sanitizePuckData(dataFor("Process", { steps: [{ title: "Plan", text: '<p onmouseover="alert(1)">Step description</p>' }] }));
    const contact = sanitizePuckData(dataFor("ContactForm", { text: '<p onclick="alert(1)">Introduction</p>' }));
    const html = JSON.stringify([team, process, contact]);
    expect(html).toContain("Biography");
    expect(html).toContain("Step description");
    expect(html).not.toMatch(/onclick|onmouseover|<script>/);
  });
});
