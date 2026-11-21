type Item = { type: string; props: Record<string, unknown> };

const SECTION_ANCHORS: Record<string, string> = {
  Services: "services", Process: "process", Pricing: "pricing", Faq: "faq", Gallery: "gallery", Testimonials: "testimonials", Team: "team",
};
const linkKey = /^(href|url|.*Link|link)$/;

/**
 * Gives curated sections stable anchors and points links that would break
 * (unselected pages, missing anchors) at a destination that exists.
 */
export function finalizeCuratedLinks(content: Item[], pages: { slug: string }[], contact: { phone: string; email: string }) {
  const anchors = new Set<string>();
  for (const { type, props } of content) {
    if (type === "ContactForm") { anchors.add("contact"); continue; }
    const anchor = SECTION_ANCHORS[type];
    const design = (props.design && typeof props.design === "object" ? props.design : {}) as { settings?: Record<string, unknown> };
    const existing = design.settings?.anchorId;
    if (typeof existing === "string" && existing) anchors.add(existing);
    else if (anchor && !anchors.has(anchor)) {
      props.design = { ...design, settings: { ...design.settings, anchorId: anchor } };
      anchors.add(anchor);
    }
  }
  const paths = new Set(pages.map(({ slug }) => `/${slug}`));
  const primary = paths.has("/contact") ? "/contact" : anchors.has("contact") ? "#contact"
    : contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : contact.email ? `mailto:${contact.email}` : "/";
  const resolve = (href: string) => {
    if (!href) return href;
    if (href.startsWith("#")) {
      const name = href.slice(1);
      return anchors.has(name) ? href : paths.has(`/${name}`) ? `/${name}` : primary;
    }
    if (href.startsWith("/") && !href.startsWith("//")) {
      const path = href.split(/[?#]/)[0].replace(/(.)\/$/, "$1");
      if (paths.has(path)) return href;
      return anchors.has(path.slice(1)) ? `#${path.slice(1)}` : primary;
    }
    return href;
  };
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "design") continue;
      if (typeof child === "string" && linkKey.test(key)) (value as Record<string, unknown>)[key] = resolve(child);
      else visit(child);
    }
  };
  content.forEach(({ props }) => visit(props));
  return content;
}
