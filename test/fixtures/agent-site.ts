import { defaultHeader } from "@/lib/header";
import { puckConfig } from "@/lib/puck/config";
import { sanitizePuckData } from "@/lib/richtext";
import type { AgentChangeset } from "@/lib/ai/agent";
import { aiCatalog, defaultSection } from "@/lib/ai/site-schemas";

type Item = { type: string; props: Record<string, unknown> };

export const fixtureIds = {
  site: "00000000-0000-4000-8000-000000000001",
  account: "00000000-0000-4000-8000-000000000002",
  home: "00000000-0000-4000-8000-000000000010",
  about: "00000000-0000-4000-8000-000000000011",
  pricing: "00000000-0000-4000-8000-000000000012",
  contact: "00000000-0000-4000-8000-000000000013",
  post: "00000000-0000-4000-8000-000000000020",
} as const;

/** The facts the fixture business has supplied. Anything else the agent states about it is invented. */
export const fixtureBusiness = {
  businessName: "Harbour Plumbing", businessType: "Plumber", city: "Example City",
  phone: "+15550100", email: "hello@harbourplumbing.example", address: "12 Quay Street, Example City",
  openingHours: "Mon–Fri 8am–6pm", services: ["Pipe repairs", "Boiler servicing", "Bathroom fitting"],
};

const defaults = (type: keyof typeof puckConfig.components) =>
  structuredClone(puckConfig.components[type].defaultProps) as Record<string, unknown>;
function curated(blockType: string, id: string, props: Record<string, unknown> = {}): Item {
  const item = defaultSection(aiCatalog.find((design) => design.blockType === blockType)!.id);
  return { ...item, props: { ...item.props, ...props, id } };
}
function layout(id: string, elements: Item[]): Item {
  const element = (type: keyof typeof puckConfig.components, key: string, props: Record<string, unknown>): Item =>
    ({ type, props: { ...defaults(type), ...props, id: `${id}-${key}` } });
  return element("Section", "section", { background: "soft", rows: [element("Row", "row", { columns: [
    element("Column", "column", { content: elements.map((item, index) => ({ ...item, props: { ...item.props, id: `${id}-${index}` } })) }),
  ] })] });
}
const footer = (id: string): Item => ({ type: "Footer", props: { ...defaults("Footer"), businessName: fixtureBusiness.businessName, tagline: "Local plumbers you can rely on.", id } });

/** A small, realistic site in the agent's sandbox, for tests and evals. Nothing here touches a database. */
export function fixtureChangeset(): AgentChangeset {
  const page = (id: string, slug: string, title: string, content: Item[]) => ({
    id, site_id: fixtureIds.site, slug, title, nav_label: title, hide_from_menu: false,
    // Stored content is sanitized when the agent loads a site.
    draft_data: sanitizePuckData({ root: { props: { title } }, content: [...content, footer(`footer-${slug || "home"}`)] }),
    seo: {}, sort_order: 0, published_at: null,
  });
  const snapshot: AgentChangeset["working"] = {
    site: {
      id: fixtureIds.site, account_id: fixtureIds.account, name: fixtureBusiness.businessName, theme: {}, draft_theme: null,
      draft_header: null, business: fixtureBusiness, seo: {},
    },
    theme: { style: "modern", headingFont: "Inter", bodyFont: "Inter", colors: { primary: "#0b5cab", secondary: "#f59e0b", background: "#ffffff", text: "#17202b" } },
    header: defaultHeader(fixtureBusiness.businessName),
    footer: footer("footer-home").props,
    pages: [
      page(fixtureIds.home, "", "Home", [
        curated("Hero", "home-hero", { heading: "Plumbing done properly", subheading: "Repairs and installations across Example City.", buttonText: "Get a quote", buttonLink: "/contact" }),
        curated("Services", "home-services", { heading: "What we do" }),
        layout("home-why", [
          { type: "Heading", props: { ...defaults("Heading"), text: "Why Harbour Plumbing", level: "h2" } },
          { type: "Text", props: { ...defaults("Text"), text: "<p>We turn up on time and tidy up after ourselves.</p>" } },
          { type: "Button", props: { ...defaults("Button"), label: "About us", href: "/about" } },
        ]),
      ]),
      page(fixtureIds.about, "about", "About", [curated("TextSection", "about-text", { heading: "About us", text: "<p>A family firm.</p>" })]),
      page(fixtureIds.pricing, "pricing", "Pricing", [curated("Pricing", "pricing-plans", { heading: "Simple pricing" })]),
      page(fixtureIds.contact, "contact", "Contact", [curated("ContactForm", "contact-form", { heading: "Get in touch" })]),
    ].map((entry, index) => ({ ...entry, sort_order: index })),
    posts: [{
      id: fixtureIds.post, site_id: fixtureIds.site, title: "How to stop a dripping tap", subtitle: "", excerpt: "A quick guide.",
      slug: "stop-a-dripping-tap", draft_content: { version: 1, blocks: [{ type: "paragraph", html: "<p>Turn off the water first.</p>" }] },
      cover_image: "", cover_alt: "", seo_title: "", seo_description: "", status: "draft", updated_at: "2026-01-01T00:00:00.000Z",
    }],
    blogSettings: {},
  };
  return { version: 1, siteId: fixtureIds.site, baseline: structuredClone(snapshot), working: snapshot, changes: [] };
}
