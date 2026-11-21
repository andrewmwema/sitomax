import type { DESIRED_SECTION_TYPES } from "./site-input";

export type PlannedSection = { blockType: string; designId: string };
type Tone = "default" | "soft" | "dark" | "primary";
type Slot = { blockType: string; designs: readonly string[] };
type DesiredSection = (typeof DESIRED_SECTION_TYPES)[number];

// Section background each design renders with (see components/blocks/*),
// used to alternate light, soft and dark bands down the page.
const DESIGN_TONES: Record<string, Tone> = {
  "hero-centered-badge": "dark", "hero-overlay-photo": "dark", "hero-video-background": "dark", "hero-lead-form": "dark",
  "services-icon-grid": "soft", "services-icon-list": "soft", "stats-photo-split": "dark",
  "process-step-cards": "soft", "text-framed-introduction": "soft", "text-accent-statement": "soft",
  "testimonials-cards": "soft", "testimonials-quotes": "soft", "testimonials-carousel": "soft", "testimonials-rating": "soft",
  "logos-partner-grid": "soft", "team-featured-lead": "soft", "pricing-three-cards": "soft", "pricing-single-checklist": "soft",
  "faq-contact-sidebar": "soft", "cta-dark-band": "dark", "cta-primary-band": "primary", "cta-image-background": "dark",
  "cta-split-form": "soft", "contact-form-centered": "soft", "contact-form-split": "soft",
  "footer-columns": "dark", "footer-centered": "dark", "footer-light-compact": "soft",
};
export const designTone = (designId: string): Tone => DESIGN_TONES[designId] ?? "default";

const hero = (...designs: string[]): Slot => ({ blockType: "Hero", designs });
const slot = (blockType: string, ...designs: string[]): Slot => ({ blockType, designs });
const closingCta = slot("CallToAction", "cta-primary-band", "cta-dark-band", "cta-image-background");

/** Conversion-focused default structure for each preset page type. */
export const PAGE_BLUEPRINTS: Record<string, { purpose: string; slots: Slot[] }> = {
  "": {
    purpose: "Make a strong first impression, show the core offer and proof, and move visitors to enquire.",
    slots: [hero("hero-split-image", "hero-overlay-photo", "hero-stats-row"),
      slot("Services", "services-icon-grid", "services-image-cards", "services-bordered-grid"),
      slot("ImageWithText", "about-image-right", "about-two-column"),
      slot("Process", "process-editorial-timeline", "process-step-cards"),
      slot("Testimonials", "testimonials-cards", "testimonials-rating"), closingCta],
  },
  about: {
    purpose: "Build trust with the story, values and approach behind the business, then invite a conversation.",
    slots: [hero("hero-split-image", "hero-overlay-photo"),
      slot("TextSection", "text-editorial-split", "text-mission", "text-side-heading"),
      slot("ImageWithText", "about-two-column", "about-image-right"),
      slot("Process", "process-step-cards", "process-editorial-timeline"),
      slot("Testimonials", "testimonials-quotes", "testimonials-cards"), closingCta],
  },
  services: {
    purpose: "Explain each service, its outcomes and how it works so visitors can choose and request a quote.",
    slots: [hero("hero-overlay-photo", "hero-split-image"),
      slot("Services", "services-alternating-rows", "services-bordered-grid", "services-image-cards"),
      slot("Process", "process-step-cards", "process-editorial-timeline"),
      slot("Faq", "faq-accordion", "faq-two-column"), closingCta],
  },
  features: {
    purpose: "Show the key features and benefits, how they solve customer problems, and lead to a demo or enquiry.",
    slots: [hero("hero-split-image", "hero-stats-row"),
      slot("Services", "services-icon-grid", "services-bordered-grid"),
      slot("ImageWithText", "about-image-right", "about-two-column"),
      slot("Services", "tabs-vertical-explorer", "services-tabs", "services-alternating-rows"),
      slot("Process", "process-editorial-timeline", "process-step-cards"), closingCta],
  },
  pricing: {
    purpose: "Present clear packages, what each includes and answers to pricing questions, then prompt a quote request.",
    slots: [hero("hero-centered-badge", "hero-split-image"),
      slot("Pricing", "pricing-three-cards", "pricing-comparison-table", "pricing-billing-toggle"),
      slot("Services", "services-bordered-grid", "services-icon-list"),
      slot("Faq", "faq-two-column", "faq-accordion"), closingCta],
  },
  portfolio: {
    purpose: "Showcase representative work and outcomes to prove quality, then invite visitors to start a project.",
    slots: [hero("hero-overlay-photo", "hero-split-image"),
      slot("Gallery", "portfolio-project-cards", "portfolio-editorial-rows", "portfolio-featured-work"),
      slot("Process", "process-photo-checklist", "process-editorial-timeline"),
      slot("Testimonials", "testimonials-carousel", "testimonials-cards"),
      slot("CallToAction", "cta-dark-band", "cta-image-background", "cta-primary-band")],
  },
  faq: {
    purpose: "Answer the most common questions and objections clearly so visitors feel confident to get in touch.",
    slots: [hero("hero-centered-badge", "hero-split-image"),
      slot("Faq", "faq-accordion", "faq-two-column"),
      slot("Process", "process-step-cards", "process-editorial-timeline"),
      slot("CallToAction", "cta-split-form", "cta-primary-band")],
  },
  team: {
    purpose: "Introduce the people and expertise behind the business to build trust and invite contact.",
    slots: [hero("hero-split-image", "hero-centered-badge"),
      slot("Team", "team-photo-cards", "team-editorial-profiles"),
      slot("TextSection", "text-mission", "text-editorial-split"),
      slot("ImageWithText", "about-image-right", "about-two-column"), closingCta],
  },
  testimonials: {
    purpose: "Collect social proof and customer outcomes in one place, then convert that trust into enquiries.",
    slots: [hero("hero-centered-badge", "hero-split-image"),
      slot("Testimonials", "testimonials-rating", "testimonials-cards"),
      slot("ImageWithText", "about-image-right", "about-two-column"),
      slot("Testimonials", "testimonials-quotes", "testimonials-carousel"), closingCta],
  },
  contact: {
    purpose: "Make it effortless to get in touch, set expectations for the response and remove last-minute doubts.",
    slots: [hero("hero-split-image", "hero-centered-badge"),
      slot("ContactForm", "contact-form-split", "contact-visit-enquire", "contact-form-centered"),
      slot("Process", "process-editorial-timeline", "process-step-cards"),
      slot("Faq", "faq-two-column", "faq-accordion")],
  },
};

const CUSTOM_BLUEPRINT: Slot[] = [hero("hero-split-image", "hero-overlay-photo"),
  slot("TextSection", "text-side-heading", "text-editorial-split"),
  slot("ImageWithText", "about-image-right", "about-two-column"),
  slot("Services", "services-bordered-grid", "services-icon-grid"), closingCta];

const REQUESTED: Record<DesiredSection, Slot> = {
  faq: slot("Faq", "faq-accordion", "faq-two-column"),
  gallery: slot("Gallery", "gallery-masonry", "portfolio-project-cards", "gallery-grid"),
  pricing: slot("Pricing", "pricing-three-cards", "pricing-comparison-table"),
  team: slot("Team", "team-photo-cards", "team-featured-lead"),
  testimonials: slot("Testimonials", "testimonials-cards", "testimonials-rating"),
  process: slot("Process", "process-step-cards", "process-editorial-timeline"),
  logos: slot("Logos", "logos-wordmark-strip", "logos-partner-grid"),
};

export const MAX_BODY_SECTIONS = 7;
const FOOTERS = ["footer-columns", "footer-light-compact"];
const TRIM_ORDER = ["Logos", "Process", "TextSection", "Stats", "ImageWithText"];
const isClosing = (blockType: string) => blockType === "CallToAction" || blockType === "ContactForm";

const DEDICATED = new Set(["Faq", "Pricing", "Gallery", "Team"]);

/** Block types a page owns (core or requested), so other pages don't repeat them as extras. */
export function ownedBlockTypes(slug: string, requested: readonly DesiredSection[]) {
  return new Set([...(PAGE_BLUEPRINTS[slug]?.slots ?? []).map(({ blockType }) => blockType),
    ...requested.map((kind) => REQUESTED[kind].blockType)].filter((type) => DEDICATED.has(type)));
}

type CustomKind = "hero" | "content" | "services" | "contact" | DesiredSection;
const CUSTOM_KIND: Record<string, CustomKind> = {
  Hero: "hero", Services: "services", ContactForm: "contact", Pricing: "pricing", Faq: "faq", Gallery: "gallery",
  Testimonials: "testimonials", Team: "team", Process: "process", Logos: "logos",
};

/** Default custom-layout section kinds for a preset page type, from the same blueprint as curated mode. */
export function presetSectionKinds(slug: string): CustomKind[] {
  const kinds = (PAGE_BLUEPRINTS[slug]?.slots ?? []).map(({ blockType }) => CUSTOM_KIND[blockType] ?? "content");
  return kinds.filter((kind, index) => kind === "content" || kinds.indexOf(kind) === index);
}

export function presetPurpose(slug: string) {
  return PAGE_BLUEPRINTS[slug]?.purpose;
}

/**
 * Deterministically turns the model's design choices into a complete page:
 * Hero first, the page type's core sections, requested sections, a closing
 * call to action and a footer, with alternating section backgrounds.
 */
export function blueprintSections(
  slug: string, proposed: PlannedSection[], requested: readonly DesiredSection[], known: (designId: string) => string | undefined,
  ownedElsewhere: ReadonlySet<string> = new Set(),
): PlannedSection[] {
  const valid = (designs: readonly string[]) => designs.filter((id) => known(id));
  const picks = proposed.filter(({ designId, blockType }) => known(designId) === blockType && blockType !== "Footer");
  const slots = (PAGE_BLUEPRINTS[slug]?.slots ?? CUSTOM_BLUEPRINT).map((entry) => ({ ...entry, designs: valid(entry.designs) }));
  for (const kind of requested) {
    const extra = REQUESTED[kind];
    if (!slots.some(({ blockType }) => blockType === extra.blockType)) {
      const closing = slots.findIndex(({ blockType }) => isClosing(blockType));
      slots.splice(closing > 0 && slots[closing].blockType === "CallToAction" ? closing : slots.length, 0,
        { ...extra, designs: valid(extra.designs) });
    }
  }
  // The model's picks become the preferred design for matching slots and
  // may add distinct supporting sections while there is room.
  const claimed = new Set<Slot>();
  for (const pick of picks) {
    const target = slots.find((entry) => entry.blockType === pick.blockType && !claimed.has(entry));
    if (target) {
      claimed.add(target);
      target.designs = [pick.designId, ...target.designs.filter((id) => id !== pick.designId)];
    } else if (pick.blockType !== "Hero" && !ownedElsewhere.has(pick.blockType) && slots.length < MAX_BODY_SECTIONS
      && !slots.some(({ designs }) => designs.includes(pick.designId))) {
      const closing = slots.findLastIndex(({ blockType }) => isClosing(blockType));
      slots.splice(closing > 0 ? closing : slots.length, 0, { blockType: pick.blockType, designs: [pick.designId] });
    }
  }
  const keep = new Set(["Hero", ...requested.map((kind) => REQUESTED[kind].blockType)]);
  const body = slots.filter(({ designs }) => designs.length);
  while (body.length > MAX_BODY_SECTIONS) {
    const removable = body.map((entry, position) => ({ entry, position })).filter(({ entry: { blockType }, position }) => !isClosing(blockType)
      && (!keep.has(blockType) || body.findIndex((entry) => entry.blockType === blockType) !== position));
    // Drop supporting sections before proof and offer sections; ties drop the later one.
    const rank = (blockType: string) => TRIM_ORDER.indexOf(blockType) < 0 ? TRIM_ORDER.length : TRIM_ORDER.indexOf(blockType);
    const victim = removable.sort((a, b) => rank(a.entry.blockType) - rank(b.entry.blockType) || b.position - a.position)[0];
    body.splice(victim ? victim.position : body.length - 1, 1);
  }
  const chosen = new Set<string>();
  const sections: PlannedSection[] = [];
  for (const entry of body) {
    const previous = sections.at(-1);
    const options = entry.designs.filter((id) => !chosen.has(id));
    const designId = options.find((id) => !previous || designTone(id) !== designTone(previous.designId)) ?? options[0] ?? entry.designs[0];
    chosen.add(designId);
    sections.push({ blockType: entry.blockType, designId });
  }
  const lastTone = designTone(sections.at(-1)?.designId ?? "");
  const footer = valid(FOOTERS).find((id) => designTone(id) !== lastTone) ?? valid(FOOTERS)[0];
  return footer ? [...sections, { blockType: "Footer", designId: footer }] : sections;
}
